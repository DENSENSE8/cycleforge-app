import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { runAssistantTurn, type AssistantEmit } from '@/lib/assistant/agent-loop';
import { makeGrokLoopDeps, runGrokAssistantTurn } from '@/lib/assistant/grok-agent-loop';
import { createTenantSession } from '@/lib/assistant/tenant-session';
import {
  enrichAssistantTurn,
  formatLocalOpsReply,
} from '@/lib/assistant/enrich-turn';
import { buildWriteTools } from '@/lib/assistant/tools/write-tools';
import { loadAssistantHistory, persistAssistantTurn } from '@/lib/assistant/chat-persistence';
import type { AssistantToolCtx } from '@/lib/assistant/tools/types';
import { aiRequestHeaders, isSelfHostedAiRuntime, type AiProviderConfig } from '@/lib/ai/provider';
import { resolveOrgAiConfig, resolveOrgAnthropicBrain, type OrgAiConfig } from '@/lib/ai/org-provider';
import { ensureGrokChatConfig } from '@/lib/integrations/grok/oauth';
import { CARTON_ASK_SYSTEM } from '@/lib/assistant/carton-ask-brief';
import { ORG_CHAT_SYSTEM } from '@/lib/assistant/org-chat-facts';
import { logger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/assistant/chat — the global English assistant (plan §3.2/§3.3).
 * A tool loop over the org-scoped registry; SSE out (meta → delta/tool/ui_tool
 * → done).
 *
 * WHICH MOUTH SPEAKS (Ask plan §17.4, PR 1):
 *   1. local_ops        deterministic answer, no model at all.
 *   2. classified facts enrichment already put the numbers in the message
 *                       (carton brief / workspace facts), so the turn is a
 *                       PHRASING round: stream one completion with NO tools.
 *                       This is the speed king and must not become a tool
 *                       round — it is why "how many packages did I pack this
 *                       week" answers in under two seconds.
 *   3. Grok connected   runGrokAssistantTurn — the full OpenAI-wire tool loop.
 *   4. else Anthropic   runAssistantTurn (the org's key, else the platform's).
 *   5. else OpenAI-wire streamHermesCompletion, mouth-only as before.
 *
 * The old `skillNeedsTools` split is gone: a page skill naming propose_mutation
 * no longer has to be handed to Anthropic, because Grok can now call tools.
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
  system?: string;
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
      // Ask is a mouth an operator watches mid-carton, and a reasoning model
      // streams its think phase into `reasoning_content` — which this reader
      // drops, so the bubble sits on "…" for the whole of it. Measured on the
      // local box: 35s of silence before the first visible word, for a
      // one-sentence answer. The system prompt below already asks for short
      // concrete answers off the live data blocks, so the think phase is
      // buying dead air. Self-hosted only — managed endpoints 400 on it.
      ...(isSelfHostedAiRuntime(args.config)
        ? { chat_template_kwargs: { enable_thinking: false } }
        : {}),
      // Same problem on the managed side, different lever. The SuperGrok proxy
      // defaults grok-4.6 to `reasoning_effort: "high"`, and this round is pure
      // phrasing — the numbers are already in the message. Measured on the QA
      // carton brief: 30 s to the first visible word at the default, and the
      // operator is standing at the box watching the bubble. The PR-0 wire
      // probe confirmed the proxy accepts the field; other managed endpoints
      // 400 on params they do not know, so it rides only where it is proven.
      ...(args.config.source === 'grok' ? { reasoning_effort: 'low' } : {}),
      messages: [
        {
          role: 'system',
          content:
            args.system ??
            'You are the operations assistant. Answer from the live data blocks in the user message. Keep answers concrete and short. Name products, not internal ids.',
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

  // SuperGrok subscription beats metered Anthropic/OpenAI keys: Ask is the
  // reason the tenant connected Grok. Refresh happens here so a stale host
  // import does not 401 the first turn.
  const grokConfig = await ensureGrokChatConfig(ctx.organizationId);
  // Grok now runs the tool loop (PR 1), so a connected session needs no
  // Anthropic brain at all — not even for a page skill with write verbs. That
  // was the `skillNeedsTools` split, and it spent Anthropic credits the
  // operator connected Grok to avoid.
  const brain = grokConfig ? null : await resolveOrgAnthropicBrain(ctx.organizationId);
  const hasAnthropic = brain !== null;
  // The flag is a FORCE, not just a permission to resolve the config. It used
  // to widen `fallbackConfig` only, while `useHermes` still required
  // `!hasAnthropic` — so on any box with ANTHROPIC_API_KEY set (every dev one)
  // setting ASSISTANT_HERMES_FALLBACK=1 resolved the local config and then
  // ignored it. Routing Ask at the local gateway was untestable as a result.
  const forceHermes = hermesFallbackForced();
  const fallbackConfig: OrgAiConfig | null =
    grokConfig ??
    (!hasAnthropic || forceHermes ? await resolveOrgAiConfig(ctx.organizationId, 'chat') : null);
  // The mouth-only OpenAI-wire path. With Grok connected it now serves ONLY
  // the classified-facts phrasing round (decided per turn below); everything
  // else goes through the Grok tool loop.
  const useHermes =
    grokConfig !== null ||
    ((forceHermes || !hasAnthropic) &&
      fallbackConfig !== null &&
      (await isProviderReachable(fallbackConfig)));
  if (!hasAnthropic && !useHermes) {
    return NextResponse.json(
      {
        error: 'assistant_unconfigured',
        detail:
          'No Anthropic provider is connected for this workspace and no reachable AI provider is available. Connect Grok (SuperGrok) or another provider in Settings → Integrations.',
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
      write('meta', {
        sessionId,
        provider: grokConfig ? 'grok' : hasAnthropic ? 'anthropic' : 'hermes',
      });

      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(ping);
        }
      }, 15_000);

      // One tenant session for the whole turn: enrichment's classified facts
      // and each tool round run on ONE connection instead of one per query
      // (plan §22 H1). It holds nothing between rounds.
      const session = createTenantSession(ctx.organizationId);
      const startedAt = Date.now();
      let enrichMs = 0;
      let firstTokenMs: number | null = null;
      const markFirstToken = () => {
        if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt;
      };
      const timing = (mode: string, extra: Record<string, unknown> = {}) => {
        const db = session.stats();
        logger.info(
          {
            mode,
            org: ctx.organizationId,
            enrich_ms: enrichMs,
            first_token_ms: firstTokenMs,
            total_ms: Date.now() - startedAt,
            db_batches: db.batches,
            db_batched: db.batched,
            db_standalone: db.standalone,
            ...extra,
          },
          'ask-timing',
        );
      };

      try {
        const enrichStartedAt = Date.now();
        const prepared = await enrichAssistantTurn(
          ctx.organizationId,
          message,
          { db: session },
          context ?? null,
          ctx.staffId,
        );
        enrichMs = Date.now() - enrichStartedAt;

        // Local-ops fast path — deterministic shipping pace, no model cost.
        if (prepared.kind === 'local_ops') {
          const text = formatLocalOpsReply(prepared.resolution);
          markFirstToken();
          write('delta', { text });
          await persistAssistantTurn(ctx.organizationId, sessionId, 'assistant', text);
          write('done', { ok: true, turns: 0, mode: 'local_ops' });
          timing('local_ops');
          return;
        }

        const voiceSystem =
          prepared.voice === 'carton'
            ? CARTON_ASK_SYSTEM
            : prepared.voice === 'org_chat'
              ? ORG_CHAT_SYSTEM
              : undefined;

        // A classified turn already HAS its numbers in the message. Phrasing
        // them is one completion with no tools — the sub-two-second path. It
        // must not be turned into a tool round for the sake of uniformity.
        const phrasingOnly = voiceSystem !== undefined && useHermes && fallbackConfig !== null;
        if (phrasingOnly) {
          const hermes = await streamHermesCompletion({
            sessionId,
            enrichedMessage: prepared.userMessage,
            write: (event, data) => {
              if (event === 'delta') markFirstToken();
              write(event, data);
            },
            config: fallbackConfig!,
            system: voiceSystem,
          });
          if (hermes.text) {
            await persistAssistantTurn(ctx.organizationId, sessionId, 'assistant', hermes.text);
          }
          write('done', { ok: hermes.ok, turns: 1, mode: 'hermes' });
          timing('hermes_phrasing', { voice: prepared.voice });
          return;
        }

        const emit = (e: AssistantEmit) => {
          if (e.type === 'delta') {
            markFirstToken();
            write('delta', { text: e.text });
          } else if (e.type === 'tool_start') write('tool', { name: e.name, status: 'start' });
          else if (e.type === 'tool_end') write('tool', { name: e.name, status: 'end', ok: e.ok });
          else if (e.type === 'ui_tool') write('ui_tool', { name: e.name, input: e.input });
          else if (e.type === 'error') write('error', { message: e.message });
        };

        // Permissions narrow the advertised kind list; enforcement is per-kind
        // inside the tools themselves.
        const writeTools = buildWriteTools(sessionId, undefined, ctx.permissions);
        const toolDeps = { query: session.query };

        if (grokConfig) {
          const grokDeps = await makeGrokLoopDeps(ctx.organizationId, sessionId, {
            config: grokConfig,
          });
          const result = await runGrokAssistantTurn(
            {
              ctx: toolCtx,
              history,
              userMessage: prepared.userMessage,
              context: context ?? null,
              voiceOverlay: voiceSystem ?? null,
              writeTools,
              toolDeps,
              runToolBatch: session.runBatch,
              emit,
            },
            grokDeps,
          );
          if (result.text) {
            await persistAssistantTurn(ctx.organizationId, sessionId, 'assistant', result.text);
          }
          write('done', { ok: result.ok, turns: result.turns, mode: 'grok' });
          timing('grok', {
            turns: result.turns,
            tools_used: result.toolsUsed,
            tools_advertised: result.toolsAdvertised,
            wire_bytes: result.wireBytes,
          });
          return;
        }

        if (useHermes) {
          const hermes = await streamHermesCompletion({
            sessionId,
            enrichedMessage: prepared.userMessage,
            write: (event, data) => {
              if (event === 'delta') markFirstToken();
              write(event, data);
            },
            // `useHermes` is only true when this resolved non-null.
            config: fallbackConfig!,
            system: voiceSystem,
          });
          if (hermes.text) {
            await persistAssistantTurn(ctx.organizationId, sessionId, 'assistant', hermes.text);
          }
          write('done', { ok: hermes.ok, turns: 1, mode: 'hermes' });
          timing('hermes');
          return;
        }

        const result = await runAssistantTurn({
          ctx: toolCtx,
          history,
          userMessage: prepared.userMessage,
          context: context ?? null,
          voiceOverlay: voiceSystem ?? null,
          writeTools,
          toolDeps,
          runToolBatch: session.runBatch,
          emit,
        });

        if (result.text) {
          await persistAssistantTurn(ctx.organizationId, sessionId, 'assistant', result.text);
        }
        write('done', { ok: result.ok, turns: result.turns, mode: 'anthropic' });
        timing('anthropic', { turns: result.turns, tools_used: result.toolsUsed });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        write('error', { message: msg });
        write('done', { ok: false, turns: 0 });
        timing('error', { error: msg.slice(0, 200) });
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
