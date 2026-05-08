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

async function runPythonScraper(params: SearchParams): Promise<Record<string, unknown> | null> {
  try {
    const scriptPath = path.join(process.cwd(), '..', 'scripts', 'search_flights.py');
    const base = new Date(params.departDate);
    const from = new Date(base);
    from.setDate(base.getDate() - 3);
    const to = new Date(base);
    to.setDate(base.getDate() + 3);
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
      ...searchParams
    } = body as SearchParams & {
      feature: Feature;
      isAlert?: boolean;
      alertOrigin?: string;
      alertDest?: string;
      alertClass?: string;
      alertMaxPrice?: number;
      points?: PointsBalance;
    };

    const encoder = new TextEncoder();

    // ── Live Prices: Python scraper → Claude formatting ──────────────────────
    if (feature === 'live-prices') {
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(
              encoder.encode('⏳ **Recherche des prix en temps réel sur Google Flights...**\n\n')
            );

            const scrapeData = await runPythonScraper(searchParams as SearchParams);

            if (scrapeData && (scrapeData.all_flights_sorted_by_price as unknown[])?.length > 0) {
              controller.enqueue(encoder.encode('✅ **Prix trouvés ! Analyse en cours...**\n\n'));

              const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 4000,
                stream: true,
                system: getLivePricesSystemPrompt(),
                messages: [
                  {
                    role: 'user',
                    content: formatLivePricesPrompt(scrapeData, searchParams as SearchParams),
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
              // Python unavailable (Vercel) or no results → fallback to Claude web search
              controller.enqueue(
                encoder.encode(
                  '🔍 **Scraper local non disponible — recherche via web en temps réel...**\n\n'
                )
              );

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
                    content: `Trouve les prix les moins chers MAINTENANT pour ${searchParams.origin}→${searchParams.destination}, départ ${searchParams.departDate}, classe ${searchParams.class}, ${searchParams.adults} passager(s). Cherche sur Google Flights, Kayak, Skyscanner. Donne le prix exact le moins cher trouvé avec lien de réservation.`,
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
      userMessage = getUserPrompt(feature, searchParams as SearchParams, points);
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
