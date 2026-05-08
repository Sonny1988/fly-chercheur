import Anthropic from '@anthropic-ai/sdk';
import { Feature, SearchParams, PointsBalance } from '@/lib/types';
import { getSystemPrompt, getUserPrompt, getAlertPrompt } from '@/lib/prompts';

export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

    const encoder = new TextEncoder();
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
