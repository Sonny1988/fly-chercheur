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
} from '@/lib/prompts';

const execAsync = promisify(exec);

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type ScraperParams = SearchParams & { maxStops?: number };

async function runPythonScraper(
  params: ScraperParams,
  dateRange = 3,
): Promise<Record<string, unknown> | null> {
  try {
    const scriptPath = path.join(process.cwd(), '..', 'scripts', 'search_flights.py');
    const base = new Date(params.departDate);
    const from = new Date(base);
    from.setDate(base.getDate() - dateRange);
    const to = new Date(base);
    to.setDate(base.getDate() + dateRange);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const cmd = [
      `python "${scriptPath}"`,
      `--origin ${params.origin}`,
      `--destination ${params.destination}`,
      `--start-date ${fmt(from)}`,
      `--end-date ${fmt(to)}`,
      `--trip-type one-way`,
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
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function runMultiScraper(
  params: ScraperParams,
  origins: string[],
  dateRange = 3,
): Promise<Record<string, unknown>> {
  const results = await Promise.allSettled(
    origins.map((org) => runPythonScraper({ ...params, origin: org }, dateRange)),
  );

  const allFlights: unknown[] = [];
  let totalDates = 0;
  let totalFlights = 0;
  const airportsFound: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value) {
      const data = result.value;
      const flights = (data.all_flights_sorted_by_price as unknown[]) || [];
      // Tag each flight with its origin airport
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

  // Sort by price, nulls last
  allFlights.sort((a, b) => {
    const ap = (a as Record<string, unknown>).price_numeric as number | null;
    const bp = (b as Record<string, unknown>).price_numeric as number | null;
    if (ap === null || ap === undefined) return 1;
    if (bp === null || bp === undefined) return -1;
    return ap - bp;
  });

  return {
    query: { origins, destination: params.destination },
    search_summary: {
      total_dates_searched: totalDates,
      total_flights_found: totalFlights,
      airports_compared: airportsFound,
    },
    all_flights_sorted_by_price: allFlights,
  };
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
      const dateRange = isHunter ? 5 : 3;
      const allOrigins = origins && origins.length > 1 ? origins : null;

      const stream = new ReadableStream({
        async start(controller) {
          try {
            const airportList = allOrigins
              ? `${allOrigins.join(', ')}`
              : scraperParams.origin;

            controller.enqueue(
              encoder.encode(
                isHunter
                  ? `🎯 **Mode Hunter — Recherche sur ${airportList} × ±${dateRange}j × toutes escales...**\n\n`
                  : `⏳ **Recherche des prix en temps réel sur Google Flights...**\n\n`,
              ),
            );

            const scrapeData = allOrigins
              ? await runMultiScraper(scraperParams, allOrigins, dateRange)
              : await runPythonScraper(scraperParams, dateRange);

            const hasFlights =
              scrapeData &&
              ((scrapeData.all_flights_sorted_by_price as unknown[])?.length ?? 0) > 0;

            if (hasFlights) {
              const count = (scrapeData!.all_flights_sorted_by_price as unknown[]).length;
              const summary = (scrapeData!.search_summary as Record<string, unknown>) || {};
              const airports = (summary.airports_compared as string[]) || [];
              controller.enqueue(
                encoder.encode(
                  airports.length > 1
                    ? `✅ **${count} vols trouvés sur ${airports.join(', ')} ! Analyse Hunter...**\n\n`
                    : `✅ **${count} vols trouvés ! Analyse en cours...**\n\n`,
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
                    content: formatLivePricesPrompt(scrapeData!, scraperParams as SearchParams),
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
              // Fallback to Claude web search
              controller.enqueue(
                encoder.encode(
                  '🔍 **Scraper local non disponible — recherche via web en temps réel...**\n\n',
                ),
              );

              const pax = [
                `${scraperParams.adults} adulte(s)`,
                scraperParams.children ? `${scraperParams.children} enfant(s)` : '',
                scraperParams.infantsOnLap ? `${scraperParams.infantsOnLap} bébé(s)` : '',
              ]
                .filter(Boolean)
                .join(' + ');

              const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 4000,
                stream: true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
                system: `${getLivePricesSystemPrompt()}\n\nTu n'as pas accès aux données scrapées. Utilise web_search pour chercher les prix actuels sur Google Flights, Kayak et Skyscanner. Fais plusieurs recherches ciblées pour trouver le prix le plus bas disponible maintenant.`,
                messages: [
                  {
                    role: 'user',
                    content: `Trouve les prix les moins chers MAINTENANT pour ${allOrigins ? allOrigins.join('/') : scraperParams.origin}→${scraperParams.destination}, départ ${scraperParams.departDate}, classe ${scraperParams.class}, ${pax}. Cherche sur Google Flights, Kayak, Skyscanner. Donne le prix exact le moins cher trouvé avec lien de réservation.`,
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
