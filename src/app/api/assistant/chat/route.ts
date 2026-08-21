import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { runAssistantTurn, type AssistantEmit } from '@/lib/assistant/agent-loop';
import {
  enrichAssistantTurn,
  formatLocalOpsReply,
} from '@/lib/assistant/enrich-turn';
import { buildWriteTools } from '@/lib/assistant/tools/write-tools';
import { loadAssistantHistory, persistAssistantTurn } from '@/lib/assistant/chat-persistence';
import type { AssistantToolCtx } from '@/lib/assistant/tools/types';
import { aiRequestHeaders, type AiProviderConfig } from '@/lib/ai/provider';
import { resolveOrgAiConfig, resolveOrgAnthropicBrain, type OrgAiConfig } from '@/lib/ai/org-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/assistant/chat — the global English assistant (plan §3.2/§3.3).
 * Claude tool-use loop over the org-scoped read-tool registry; SSE stream out
 * (meta → delta/tool/ui_tool → done).
 *
 * Pre-loop: local_ops fast path + enrichAssistantMessage (parity with Hermes
 * /api/ai/chat). Both brains resolve PER ORG: the agent loop takes the org's
 * Anthropic key (vault, else the platform key), and the OpenAI-wire fallback
 * takes the org's provider chain when no Anthropic brain is available (or when
 * ASSISTANT_HERMES_FALLBACK forces it).
 *
 * org/staff/permissions come from ctx — never the body.
 */

const ContextSchema = z
  .object({
    page: z.string().min(1).max(80),
    station: z.string().max(40).nullish(),
    mode: z.string().max(80).nullish(),
    selection: z
      .object({ kind: z.string().max(40), id: z.union([z.string().max(80), z.number().int()]) })
      .nullish(),
    skill: z.string().max(4000).nullish(),
  })
  .strict();

const BodySchema = z
  .object({
    sessionId: z.string().regex(/^[A-Za-z0-9._-]{8,80}$/),
    message: z.string().min(1).max(4000),
    context: ContextSchema.nullish(),
  })
  .strict();

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Whether to consider the OpenAI-wire fallback at all.
 *
 * The env flag forces it on. Otherwise the decision is made per ORG by the
 * caller, from whether that org has an Anthropic brain — it used to read the
 * platform key here, which answered the same way for every tenant.
 */
function hermesFallbackForced(): boolean {
  const flag = String(process.env.ASSISTANT_HERMES_FALLBACK || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

async function isProviderReachable(config: AiProviderConfig): Promise<boolean> {
  try {
    const res = await fetch(`${config.baseURL}/models`, {
      headers: aiRequestHeaders(config),
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function streamHermesCompletion(args: {
  sessionId: string;
  enrichedMessage: string;
  write: (event: string, data: unknown) => void;
  config: OrgAiConfig;
}): Promise<{ ok: boolean; text: string }> {
  const hermesRes = await fetch(`${args.config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: aiRequestHeaders(args.config, {
      'X-Hermes-Session-Id': args.sessionId,
      'X-Source': 'assistant',
    }),
    body: JSON.stringify({
      model: args.config.model,
      stream: true,
      messages: [
        {
          role: 'system',
          content:
            'You are the operations assistant. Answer from the live data blocks in the user message. Keep answers concrete and short. Cite record links when present.',
        },
        { role: 'user', content: args.enrichedMessage },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!hermesRes.ok || !hermesRes.body) {
    const detail = await hermesRes.text().catch(() => '');
    args.write('error', { message: `Hermes unavailable (${hermesRes.status}): ${detail.slice(0, 200)}` });
    return { ok: false, text: '' };
  }

  const reader = hermesRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          args.write('delta', { text: delta });
        }
      } catch {
        /* ignore malformed chunks */
      }
    }
  }
  return { ok: text.length > 0, text };
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({
    headers: req.headers,
    routeKey: 'assistant-chat',
    limit: Number(process.env.ASSISTANT_CHAT_RATE_LIMIT || 25),
    windowMs: 60 * 1000,
    organizationId: ctx.organizationId,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, { status: 429 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', detail: parsed.error.message }, { status: 400 });
  }
  const { sessionId, message, context } = parsed.data;

  // Both halves are now per-org. The agent loop needs an ANTHROPIC-native brain
  // (its tool-use protocol is not the OpenAI wire format), so an org's own
  // Anthropic key is preferred over the platform's; everything else falls to
  // the OpenAI-wire chain.
  const brain = await resolveOrgAnthropicBrain(ctx.organizationId);
  const hasAnthropic = brain !== null;
  const fallbackConfig =
    !hasAnthropic || hermesFallbackForced()
      ? await resolveOrgAiConfig(ctx.organizationId, 'chat')
      : null;
  const useHermes =
    !hasAnthropic && fallbackConfig !== null && (await isProviderReachable(fallbackConfig));
  if (!hasAnthropic && !useHermes) {
    return NextResponse.json(
      {
        error: 'assistant_unconfigured',
        detail:
          'No Anthropic provider is connected for this workspace and no reachable AI provider is available. Connect one in Settings → AI.',
      },
      { status: 503 },
    );
  }

  const toolCtx: AssistantToolCtx = {
    organizationId: ctx.organizationId,
    staffId: ctx.staffId ?? null,
    permissions: ctx.permissions,
  };

  const history = await loadAssistantHistory(ctx.organizationId, sessionId).catch(() => []);
  await persistAssistantTurn(ctx.organizationId, sessionId, 'user', message);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          /* client went away */
        }
      };
      write('meta', { sessionId, provider: useHermes ? 'hermes' : 'anthropic' });

      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(ping);
        }
      }, 15_000);

      try {
        const prepared = await enrichAssistantTurn(ctx.organizationId, message);

        // Local-ops fast path — deterministic shipping pace, no model cost.
        if (prepared.kind === 'local_ops') {
          const text = formatLocalOpsReply(prepared.resolution);
          write('delta', { text });
          await persistAssistantTurn(ctx.organizationId, sessionId, 'assistant', text);
          write('done', { ok: true, turns: 0, mode: 'local_ops' });
          return;
        }

        if (useHermes) {
          const hermes = await streamHermesCompletion({
            sessionId,
            enrichedMessage: prepared.userMessage,
            write,
            // `useHermes` is only true when this resolved non-null.
            config: fallbackConfig!,
          });
          if (hermes.text) {
            await persistAssistantTurn(ctx.organizationId, sessionId, 'assistant', hermes.text);
          }
          write('done', { ok: hermes.ok, turns: 1, mode: 'hermes' });
          return;
        }

        const emit = (e: AssistantEmit) => {
          if (e.type === 'delta') write('delta', { text: e.text });
          else if (e.type === 'tool_start') write('tool', { name: e.name, status: 'start' });
          else if (e.type === 'tool_end') write('tool', { name: e.name, status: 'end', ok: e.ok });
          else if (e.type === 'ui_tool') write('ui_tool', { name: e.name, input: e.input });
          else if (e.type === 'error') write('error', { message: e.message });
        };

        const result = await runAssistantTurn({
          ctx: toolCtx,
          history,
          userMessage: prepared.userMessage,
          context: context ?? null,
          // Permissions narrow the advertised kind list; enforcement is
          // per-kind inside the tools themselves.
          writeTools: buildWriteTools(sessionId, undefined, ctx.permissions),
          emit,
        });

        if (result.text) {
          await persistAssistantTurn(ctx.organizationId, sessionId, 'assistant', result.text);
        }
        write('done', { ok: result.ok, turns: result.turns });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        write('error', { message: msg });
        write('done', { ok: false, turns: 0 });
      } finally {
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}, { permission: 'assistant.chat' });
