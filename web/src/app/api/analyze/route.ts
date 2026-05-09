import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { Feature, SearchParams, PointsBalance } from '@/lib/types';
import {
  getSystemPrompt,
  getUserPrompt,
  getAlertPrompt,
  getLivePricesSystemPrompt,
  formatLivePricesPrompt,
  formatHubArbitragePrompt,
} from '@/lib/prompts';

const execAsync = promisify(exec);

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type ScraperParams = SearchParams & { maxStops?: number };

async function runPythonScraper(
  params: ScraperParams,
  dateRange = 0,
): Promise<{ data: Record<string, unknown> | null; scraperError?: string }> {
  try {
    const scriptPath = path.join(process.cwd(), '..', 'scripts', 'search_flights.py');
    const base = new Date(params.departDate);
    const from = new Date(base);
    from.setDate(base.getDate() - dateRange);
    const to = new Date(base);
    to.setDate(base.getDate() + dateRange);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const tripType = params.tripType || 'one-way';
    const returnOffset =
      tripType === 'round-trip' && params.returnDate
        ? Math.ceil(
            (new Date(params.returnDate).getTime() - new Date(params.departDate).getTime()) /
              86400000,
          )
        : null;

    const cmd = [
      `python "${scriptPath}"`,
      `--origin ${params.origin}`,
      `--destination ${params.destination}`,
      `--start-date ${fmt(from)}`,
      `--end-date ${fmt(to)}`,
      `--trip-type ${tripType}`,
      ...(returnOffset !== null ? [`--return-offset ${returnOffset}`] : []),
      `--seat ${params.class === 'first' ? 'first' : params.class}`,
      `--adults ${params.adults}`,
      ...(params.children ? [`--children ${params.children}`] : []),
      ...(params.infantsOnLap ? [`--infants-on-lap ${params.infantsOnLap}`] : []),
      ...(params.maxStops !== undefined && params.maxStops >= 0
        ? [`--max-stops ${params.maxStops}`]
        : []),
      `--currency EUR`,
      `--sample-mode 1`,
      `--delay 1`,
    ].join(' ');

    const { stdout } = await execAsync(cmd, { timeout: 50000 });
    return { data: JSON.parse(stdout) as Record<string, unknown> };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scraper error]', msg);
    return { data: null, scraperError: msg };
  }
}

// Ryanair LCC airports within reach of Amsterdam
const RYANAIR_NEARBY = ['EIN', 'STN', 'BRU', 'CRL'];

async function runTequilaScraper(
  params: ScraperParams,
  dateRange = 3,
): Promise<Record<string, unknown>[]> {
  const apiKey = process.env.TEQUILA_API_KEY;
  if (!apiKey) return [];

  try {
    const scriptPath = path.join(process.cwd(), '..', 'scripts', 'search_tequila.py');
    const base = new Date(params.departDate);
    const from = new Date(base); from.setDate(base.getDate() - dateRange);
    const to = new Date(base); to.setDate(base.getDate() + dateRange);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const isRound = params.tripType === 'round-trip' && params.returnDate;
    const returnOffset = isRound
      ? Math.ceil(
          (new Date(params.returnDate!).getTime() - new Date(params.departDate).getTime()) /
            86400000,
        )
      : null;

    const returnFrom = returnOffset !== null
      ? fmt(new Date(new Date(params.returnDate!).getTime() - dateRange * 86400000))
      : null;
    const returnTo = returnOffset !== null
      ? fmt(new Date(new Date(params.returnDate!).getTime() + dateRange * 86400000))
      : null;

    const cmd = [
      `python "${scriptPath}"`,
      `--origin ${params.origin}`,
      `--destination ${params.destination}`,
      `--date-from ${fmt(from)}`,
      `--date-to ${fmt(to)}`,
      ...(returnFrom ? [`--return-from ${returnFrom}`, `--return-to ${returnTo}`] : []),
      `--adults ${params.adults}`,
      ...(params.children ? [`--children ${params.children}`] : []),
      ...(params.infantsOnLap ? [`--infants ${params.infantsOnLap}`] : []),
      ...(params.maxStops !== undefined && params.maxStops >= 0
        ? [`--max-stops ${params.maxStops}`]
        : []),
      `--currency EUR`,
      `--limit 30`,
      `--api-key ${apiKey}`,
    ].join(' ');

    const { stdout } = await execAsync(cmd, { timeout: 20000 });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    return (parsed.all_flights_sorted_by_price as Record<string, unknown>[]) || [];
  } catch {
    return [];
  }
}

async function runAmadeusScraper(
  params: ScraperParams,
): Promise<Record<string, unknown>[]> {
  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  try {
    const scriptPath = path.join(process.cwd(), '..', 'scripts', 'search_amadeus.py');
    const isRound = params.tripType === 'round-trip' && params.returnDate;
    const cabinMap: Record<string, string> = {
      economy: 'ECONOMY', business: 'BUSINESS', first: 'FIRST',
    };

    const cmd = [
      `python "${scriptPath}"`,
      `--origin ${params.origin}`,
      `--destination ${params.destination}`,
      `--date ${params.departDate}`,
      ...(isRound ? [`--return-date ${params.returnDate}`] : []),
      `--adults ${params.adults}`,
      ...(params.children ? [`--children ${params.children}`] : []),
      ...(params.infantsOnLap ? [`--infants ${params.infantsOnLap}`] : []),
      ...(params.maxStops !== undefined && params.maxStops >= 0
        ? [`--max-stops ${params.maxStops}`]
        : []),
      `--cabin ${cabinMap[params.class] ?? 'ECONOMY'}`,
      `--currency EUR`,
      `--limit 20`,
      `--client-id ${clientId}`,
      `--client-secret ${clientSecret}`,
    ].join(' ');

    const { stdout } = await execAsync(cmd, { timeout: 25000 });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    return (parsed.all_flights_sorted_by_price as Record<string, unknown>[]) || [];
  } catch {
    return [];
  }
}

async function runRyanairScraper(
  params: ScraperParams,
  dateRange = 3,
): Promise<Record<string, unknown>[]> {
  try {
    const scriptPath = path.join(process.cwd(), '..', 'scripts', 'search_ryanair.py');
    const base = new Date(params.departDate);
    const from = new Date(base); from.setDate(base.getDate() - dateRange);
    const to = new Date(base); to.setDate(base.getDate() + dateRange);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    // Run one search per nearby airport in parallel
    const airports = RYANAIR_NEARBY.filter((a) => a !== params.origin);
    const tasks = airports.map(async (airport) => {
      const cmd = [
        `python "${scriptPath}"`,
        `--origin ${airport}`,
        `--destination ${params.destination}`,
        `--date-from ${fmt(from)}`,
        `--date-to ${fmt(to)}`,
        `--currency EUR`,
        `--limit 10`,
      ].join(' ');
      try {
        const { stdout } = await execAsync(cmd, { timeout: 20000 });
        const parsed = JSON.parse(stdout) as Record<string, unknown>;
        return (parsed.all_flights_sorted_by_price as Record<string, unknown>[]) || [];
      } catch {
        return [];
      }
    });

    const allResults = await Promise.allSettled(tasks);
    const combined: Record<string, unknown>[] = [];
    for (const r of allResults) {
      if (r.status === 'fulfilled') combined.push(...r.value);
    }
    return combined;
  } catch {
    return [];
  }
}

async function runMultiScraper(
  params: ScraperParams,
  origins: string[],
  dateRange = 0,
): Promise<{ data: Record<string, unknown>; scraperErrors: string[] }> {
  const results = await Promise.allSettled(
    origins.map((org) => runPythonScraper({ ...params, origin: org }, dateRange)),
  );

  const allFlights: unknown[] = [];
  let totalDates = 0;
  let totalFlights = 0;
  const airportsFound: string[] = [];
  const scraperErrors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      const { data, scraperError } = result.value;
      if (scraperError) scraperErrors.push(`${origins[i]}: ${scraperError}`);
      if (data) {
        const flights = (data.all_flights_sorted_by_price as unknown[]) || [];
        const tagged = flights.map((f) => ({
          ...(f as Record<string, unknown>),
          departure_airport: origins[i],
        }));
        allFlights.push(...tagged);
        const summary = (data.search_summary as Record<string, unknown>) || {};
        totalDates += Number(summary.total_dates_searched || 0);
        totalFlights += Number(summary.total_flights_found || 0);
        airportsFound.push(origins[i]);
      }
    }
  }

  // Sort by price, nulls last
  allFlights.sort((a, b) => {
    const ap = (a as Record<string, unknown>).price_numeric as number | null;
    const bp = (b as Record<string, unknown>).price_numeric as number | null;
    if (ap === null || ap === undefined) return 1;
    if (bp === null || bp === undefined) return -1;
    return ap - bp;
  });

  return {
    data: {
      query: { origins, destination: params.destination },
      search_summary: {
        total_dates_searched: totalDates,
        total_flights_found: totalFlights,
        airports_compared: airportsFound,
      },
      all_flights_sorted_by_price: allFlights,
    },
    scraperErrors,
  };
}

async function runHubArbitrage(
  params: ScraperParams,
): Promise<{ data: Record<string, unknown> | null; error?: string }> {
  try {
    const scriptPath = path.join(process.cwd(), '..', 'scripts', 'search_hub_arbitrage.py');
    const base = new Date(params.departDate);
    const end = params.returnDate
      ? new Date(params.returnDate)
      : new Date(base.getTime() + 30 * 86400000); // default 30-day window
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const seat = params.class === 'economy' ? 'business' : params.class; // default to business

    const cmd = [
      `python "${scriptPath}"`,
      `--origin ${params.origin}`,
      `--destination ${params.destination}`,
      `--start-date ${fmt(base)}`,
      `--end-date ${fmt(end)}`,
      `--seat ${seat}`,
      `--adults ${params.adults}`,
      `--currency EUR`,
      `--max-positioning 350`,
      `--workers 4`,
    ].join(' ');

    const { stdout } = await execAsync(cmd, { timeout: 180000 });
    return { data: JSON.parse(stdout) as Record<string, unknown> };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[hub-arbitrage error]', msg);
    return { data: null, error: msg };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      feature,
      isAlert,
      alertOrigin,
      alertDest,
      alertClass,
      alertMaxPrice,
      points,
      origins,
      maxStops,
      ...searchParams
    } = body as SearchParams & {
      feature: Feature;
      isAlert?: boolean;
      alertOrigin?: string;
      alertDest?: string;
      alertClass?: string;
      alertMaxPrice?: number;
      points?: PointsBalance;
      origins?: string[];
      maxStops?: number;
    };

    const encoder = new TextEncoder();
    const scraperParams: ScraperParams = { ...searchParams as SearchParams, maxStops };

    // ── Live Prices & Hunter: Python scraper → Claude formatting ─────────────
    if (feature === 'live-prices' || feature === 'hunter') {
      const isHunter = feature === 'hunter';
      // live-prices = date exacte uniquement (dateRange=0), hunter = ±5j pour flexibilité
      const dateRange = isHunter ? 5 : 0;
      const allOrigins = origins && origins.length > 1 ? origins : null;

      const stream = new ReadableStream({
        async start(controller) {
          try {
            const airportList = allOrigins ? allOrigins.join(', ') : scraperParams.origin;

            controller.enqueue(
              encoder.encode(
                isHunter
                  ? `🎯 **Mode Hunter — Recherche sur ${airportList} × ±${dateRange}j × toutes escales...**\n\n`
                  : `⏳ **Recherche des prix en temps réel sur Google Flights...**\n\n`,
              ),
            );

            // Hunter: Google Flights + Ryanair + Kiwi Tequila + Amadeus in parallel
            const [raw, ryanairFlights, tequilaFlights, amadeusFlights] = await Promise.all([
              allOrigins
                ? runMultiScraper(scraperParams, allOrigins, dateRange)
                : runPythonScraper(scraperParams, dateRange),
              isHunter ? runRyanairScraper(scraperParams, dateRange) : Promise.resolve([]),
              isHunter ? runTequilaScraper(scraperParams, dateRange) : Promise.resolve([]),
              isHunter ? runAmadeusScraper(scraperParams) : Promise.resolve([]),
            ]);

            const flightData = raw.data;
            const scraperErrors = 'scraperErrors' in raw ? raw.scraperErrors : (raw.scraperError ? [raw.scraperError] : []);

            // Merge all API results into the main dataset
            const lccFlights = [...ryanairFlights, ...tequilaFlights, ...amadeusFlights];
            if (flightData && lccFlights.length > 0) {
              const existing = (flightData.all_flights_sorted_by_price as unknown[]) || [];
              const merged = [...existing, ...lccFlights];
              merged.sort((a, b) => {
                const ap = (a as Record<string, unknown>).price_numeric as number | null;
                const bp = (b as Record<string, unknown>).price_numeric as number | null;
                if (ap === null || ap === undefined) return 1;
                if (bp === null || bp === undefined) return -1;
                return (ap as number) - (bp as number);
              });
              flightData.all_flights_sorted_by_price = merged;
              const summary = (flightData.search_summary as Record<string, unknown>) || {};
              if (ryanairFlights.length > 0) summary.ryanair_lcc_flights = ryanairFlights.length;
              if (tequilaFlights.length > 0) summary.kiwi_tequila_flights = tequilaFlights.length;
              if (amadeusFlights.length > 0) summary.amadeus_flights = amadeusFlights.length;
            }
            const hasFlights =
              flightData &&
              ((flightData.all_flights_sorted_by_price as unknown[])?.length ?? 0) > 0;

            if (hasFlights) {
              const count = (flightData!.all_flights_sorted_by_price as unknown[]).length;
              const summary = (flightData!.search_summary as Record<string, unknown>) || {};
              const airports = (summary.airports_compared as string[]) || [];
              const lccParts = [
                ryanairFlights.length > 0 ? `${ryanairFlights.length} Ryanair` : '',
                tequilaFlights.length > 0 ? `${tequilaFlights.length} Kiwi` : '',
                amadeusFlights.length > 0 ? `${amadeusFlights.length} Amadeus` : '',
              ].filter(Boolean);
              const ryanairNote = lccParts.length > 0 ? ` + ${lccParts.join(' + ')}` : '';
              controller.enqueue(
                encoder.encode(
                  airports.length > 1
                    ? `✅ **${count} vols trouvés sur ${airports.join(', ')}${ryanairNote} ! Analyse Hunter...**\n\n`
                    : `✅ **${count} vols trouvés${ryanairNote} ! Analyse en cours...**\n\n`,
                ),
              );

              const systemPrompt = isHunter
                ? getSystemPrompt('hunter')
                : getLivePricesSystemPrompt();

              const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 4000,
                stream: true,
                system: systemPrompt,
                messages: [
                  {
                    role: 'user',
                    content: formatLivePricesPrompt(flightData!, scraperParams as SearchParams),
                  },
                ],
              });

              for await (const event of response) {
                if (
                  event.type === 'content_block_delta' &&
                  event.delta.type === 'text_delta'
                ) {
                  controller.enqueue(encoder.encode(event.delta.text));
                }
              }
            } else {
              // Scraper a échoué — afficher la raison et des liens directs filtrés
              const reason = scraperErrors.length > 0 ? scraperErrors.join(' | ') : 'Aucun vol retourné';
              const orig = allOrigins ? allOrigins[0] : scraperParams.origin;
              const dest = scraperParams.destination;
              const dep = scraperParams.departDate;
              const ret = scraperParams.returnDate || '';
              const paxStr = [
                `${scraperParams.adults} adulte(s)`,
                scraperParams.children ? `${scraperParams.children} enfant(s)` : '',
                scraperParams.infantsOnLap ? `${scraperParams.infantsOnLap} bébé(s)` : '',
              ].filter(Boolean).join(' + ');

              // Liens directs pré-filtrés (date + passagers exacts)
              const gflights = `https://www.google.com/travel/flights/search?q=Flights+from+${orig}+to+${dest}+on+${dep}${ret ? `+returning+${ret}` : ''}&curr=EUR`;
              const skyscanner = `https://www.skyscanner.net/transport/flights/${orig.toLowerCase()}/${dest.toLowerCase()}/${dep.replace(/-/g, '')}/${ret ? ret.replace(/-/g, '') + '/' : ''}`;
              const kayak = `https://www.kayak.fr/flights/${orig}-${dest}/${dep}${ret ? '/' + ret : ''}/${scraperParams.adults}adults`;

              controller.enqueue(
                encoder.encode(
                  `❌ **Scraper Google Flights indisponible** — Raison : \`${reason}\`\n\n` +
                  `**Paramètres exacts de ta recherche :**\n` +
                  `- Route : ${orig} → ${dest}\n` +
                  `- Départ : ${dep}${ret ? ` | Retour : ${ret}` : ''}\n` +
                  `- Passagers : ${paxStr}\n` +
                  `- Classe : ${scraperParams.class}\n\n` +
                  `**Liens de réservation avec ces filtres exacts :**\n` +
                  `- [Google Flights](${gflights})\n` +
                  `- [Skyscanner](${skyscanner})\n` +
                  `- [Kayak](${kayak})\n\n` +
                  `> Ces liens ouvrent directement la recherche avec ta route et tes dates. Les prix affichés seront exacts pour ta configuration.\n`,
                ),
              );
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Erreur inconnue';
            controller.enqueue(encoder.encode(`\n\n**Erreur :** ${msg}`));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // ── Standard features ─────────────────────────────────────────────────────
    let systemPrompt: string;
    let userMessage: string;

    if (isAlert && alertOrigin && alertDest && alertClass && alertMaxPrice) {
      const parsed = JSON.parse(getAlertPrompt(alertOrigin, alertDest, alertClass, alertMaxPrice));
      systemPrompt = parsed.system;
      userMessage = parsed.user;
    } else {
      systemPrompt = getSystemPrompt(feature);
      userMessage = getUserPrompt(
        feature,
        { ...searchParams as SearchParams, origins } as SearchParams,
        points,
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4000,
            stream: true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
          });

          for await (const event of response) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erreur inconnue';
          controller.enqueue(encoder.encode(`\n\n**Erreur :** ${msg}`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
