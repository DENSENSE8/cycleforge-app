import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { runAssistantTurn, type AssistantEmit } from '@/lib/assistant/agent-loop';
import { makeGrokLoopDeps, runGrokAssistantTurn } from '@/lib/assistant/grok-agent-loop';
import {
  chooseAssistantMouth,
  type AssistantMouthInputs,
} from '@/lib/assistant/assistant-mouth';
import { createTenantSession } from '@/lib/assistant/tenant-session';
import {
  enrichAssistantTurn,
  formatLocalOpsReply,
} from '@/lib/assistant/enrich-turn';
import { buildWriteTools } from '@/lib/assistant/tools/write-tools';
import { loadAssistantHistory, persistAssistantTurn, setSessionTitle } from '@/lib/assistant/chat-persistence';
import { generateSessionTitle } from '@/lib/ai/session-title';
import type { AssistantToolCtx } from '@/lib/assistant/tools/types';
import { aiRequestHeaders, isSelfHostedAiRuntime } from '@/lib/ai/provider';
import { resolveOrgAiConfig, resolveOrgAnthropicBrain, type OrgAiConfig } from '@/lib/ai/org-provider';
import { isProviderReachableCached } from '@/lib/ai/provider-reachability';
import { ensureGrokChatConfig } from '@/lib/integrations/grok/oauth';
import { CARTON_ASK_SYSTEM } from '@/lib/assistant/carton-ask-brief';
import { ORG_CHAT_SYSTEM } from '@/lib/assistant/org-chat-facts';
import { logger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/assistant/chat — the global English assistant (plan §3.2/§3.3).
 * A tool loop over the org-scoped registry; SSE out (meta → delta/tool/
 * ui_tool_start/ui_tool → done).
 *
 * TIME TO FIRST BYTE IS A LAW HERE: only the rate-limit guard and body
 * validation may run before `new ReadableStream` — they are the two answers
 * that still need a real HTTP status (429/400). Provider resolution, the
 * gateway reachability probe, history load and the user-row write all happen
 * inside `start()`, after the first `meta` frame is on the wire. Moving any of
 * them back out re-introduces seconds of blank bubble.
 *
 * WHICH MOUTH SPEAKS — `chooseAssistantMouth` (assistant-mouth.ts) decides;
 * this route only resolves the inputs and runs the loop it names:
 *   1. local_ops        deterministic answer, no model at all.
 *   2. classified facts enrichment already put the numbers in the message
 *                       (carton brief / workspace facts), so the turn is a
 *                       PHRASING round: stream one completion with NO tools.
 *                       This is the speed king and must not become a tool
 *                       round — it is why "how many packages did I pack this
 *                       week" answers in under two seconds.
 *   3. wire-tools       runGrokAssistantTurn — the provider-agnostic
 *                       OpenAI-wire tool loop. EVERY reachable member of the
 *                       chain gets it: a connected Grok session, the tenant's
 *                       self-hosted slot, and (2026-09-06) `ai_gateway` /
 *                       `openai` / `anthropic`-compat / `platform`, which used
 *                       to fall through to a mouth-only stream that could not
 *                       call a verb or paint the artifact canvas at all.
 *   4. anthropic-tools  runAssistantTurn — the native tool-use protocol.
 *
 * The old `skillNeedsTools` split is gone: a page skill naming propose_mutation
 * no longer has to be handed to Anthropic, because every mouth calls tools.
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

/** Everything the ladder needs that costs I/O to learn. */
type ResolvedProviders = Omit<AssistantMouthInputs, 'classifiedFacts'>;

/**
 * Resolve the ladder's inputs: three DB reads and a live network probe.
 *
 * This runs INSIDE the SSE stream, never before it. It used to be the whole of
 * time-to-first-byte — the operator sat in front of an empty bubble for the
 * length of a Grok token refresh plus two org-config reads plus a 2s
 * reachability probe, and the probe's worst case (a black-holed gateway) is
 * also its slowest. Nothing here is needed to write the first `meta` frame, so
 * nothing here gets to hold it up.
 *
 * The DECISION is not here. It is `chooseAssistantMouth`, so that the one
 * property that matters — a reachable provider is never answered by a mouth
 * that cannot call a tool — is a unit test instead of four `if` blocks buried
 * in a stream closure.
 */
async function resolveAssistantProviders(organizationId: string): Promise<ResolvedProviders> {
  // SuperGrok subscription beats metered Anthropic/OpenAI keys: Ask is the
  // reason the tenant connected Grok. Refresh happens here so a stale host
  // import does not 401 the first turn.
  const grokConfig = await ensureGrokChatConfig(organizationId);
  // Grok runs the tool loop, so a connected session needs no Anthropic brain
  // at all — not even for a page skill with write verbs. That was the
  // `skillNeedsTools` split, and it spent Anthropic credits the operator
  // connected Grok to avoid.
  const brain = grokConfig ? null : await resolveOrgAnthropicBrain(organizationId);
  // Resolve the chain UNCONDITIONALLY (2026-09-06). It used to be gated on
  // `!hasAnthropic || forceHermes`, which made Anthropic a hard-coded
  // preference: on any box carrying ANTHROPIC_API_KEY — every dev one — a
  // configured local model was never even resolved, so there was no way to
  // work without spending metered credits. The ORDER preference
  // (`aiProviderSequence`, local-first by default) is the thing that decides,
  // not the presence of one vendor's key.
  const chatConfig: OrgAiConfig | null =
    grokConfig ?? (await resolveOrgAiConfig(organizationId, 'chat'));
  // The probe is memoized per base URL (`provider-reachability`): the answer
  // does not change between two messages typed a minute apart, and paying a
  // network round-trip per turn is what made this block expensive.
  const chatReachable = chatConfig !== null && (await isProviderReachableCached(chatConfig));
  return {
    grokConfig,
    hasAnthropic: brain !== null,
    chatConfig,
    chatReachable,
    forceWireFallback: hermesFallbackForced(),
  };
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

  const toolCtx: AssistantToolCtx = {
    organizationId: ctx.organizationId,
    staffId: ctx.staffId ?? null,
    permissions: ctx.permissions,
  };

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
      // FIRST BYTE, before any I/O at all. Everything that decides the mouth
      // (Grok refresh, org brain, gateway probe) and everything that loads or
      // writes chat rows now happens below, inside this stream — so the client
      // gets a live turn to render immediately instead of a blank bubble held
      // by a network probe. `provider` is not knowable yet; a second `meta`
      // carries the real one as soon as resolution lands.
      write('meta', { sessionId, provider: 'resolving' });

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
      let providerMs = 0;
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
            provider_ms: providerMs,
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

      // The user's own row is a write nobody is waiting to read: starting it
      // here and awaiting it later keeps it off first-byte without dropping
      // it. The two rows must still land user-then-assistant, so every
      // assistant write goes through this and joins the promise first.
      const userPersisted = persistAssistantTurn(ctx.organizationId, sessionId, 'user', message).catch(
        (err: unknown) => {
          logger.warn(
            { org: ctx.organizationId, session: sessionId, err: String(err) },
            'ask-user-row-failed',
          );
        },
      );
      const persistReply = async (text: string) => {
        await userPersisted;
        await persistAssistantTurn(ctx.organizationId, sessionId, 'assistant', text);
      };
      // First message → the session was just created with a provisional title.
      // Summarize it into a real name in the background and push it to the
      // client over `title` (emitted in `finally`), so the header/spine stop
      // showing the provisional truncation the moment the model can name the
      // thread. Non-created turns resolve to null and emit nothing.
      const titling = userPersisted
        .then(async (persisted) => {
          if (!persisted || !persisted.created) return null;
          const title = await generateSessionTitle(ctx.organizationId, message);
          await setSessionTitle(ctx.organizationId, sessionId, title);
          return title;
        })
        .catch(() => null);

      try {
        // Providers and history are independent of each other AND of
        // enrichment, so they run underneath it: the deterministic local_ops
        // answer below then costs nothing at all — no token refresh, no
        // gateway probe, no history read on the critical path.
        const resolving = Promise.all([
          (async () => {
            const at = Date.now();
            const providers = await resolveAssistantProviders(ctx.organizationId);
            providerMs = Date.now() - at;
            return providers;
          })(),
          loadAssistantHistory(ctx.organizationId, sessionId).catch(() => []),
        ]);
        // A local_ops turn returns without ever joining this, so keep the
        // rejection handled — the join below still sees the real failure.
        resolving.catch(() => {});

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
          await persistReply(text);
          write('done', { ok: true, turns: 0, mode: 'local_ops' });
          timing('local_ops');
          return;
        }

        const [providers, history] = await resolving;

        const voiceSystem =
          prepared.voice === 'carton'
            ? CARTON_ASK_SYSTEM
            : prepared.voice === 'org_chat'
              ? ORG_CHAT_SYSTEM
              : undefined;

        const mouth = chooseAssistantMouth({
          ...providers,
          classifiedFacts: voiceSystem !== undefined,
        });

        if (mouth.kind === 'unconfigured') {
          // This used to be a 503. It cannot be one any more — the response
          // headers left with the first `meta` frame — and that is an upgrade,
          // not a compromise: the client renders an `error` event straight
          // into the assistant bubble, so the operator now reads the sentence
          // in the conversation instead of getting a silently failed fetch.
          //
          // The copy names no vendor. It used to lead with "No Anthropic
          // provider is connected", which read as though one vendor were
          // required — and pointed an operator at a paid key when a free local
          // model would do.
          write('error', {
            message:
              'No AI provider is reachable for this workspace. Connect one in Settings → Integrations, or point the assistant at a local model (Ollama / MLX) with OLLAMA_BASE_URL and OLLAMA_MODEL.',
          });
          write('done', { ok: false, turns: 0 });
          timing('unconfigured');
          return;
        }

        // The real mouth, now that it is known. It names the PROVIDER, not the
        // transport: every managed endpoint used to report `hermes` because
        // they all shared the mouth-only path, which made a gateway turn and a
        // local turn indistinguishable in the log.
        write('meta', {
          sessionId,
          provider: mouth.kind === 'anthropic-tools' ? 'anthropic' : mouth.config.source,
        });

        // A classified turn already HAS its numbers in the message. Phrasing
        // them is one completion with no tools — the sub-two-second path. It
        // must not be turned into a tool round for the sake of uniformity, and
        // `chooseAssistantMouth` is where that exception is scoped: it yields
        // to a self-hosted loop, which is free and can verify the numbers.
        if (mouth.kind === 'phrasing') {
          const phrased = await streamHermesCompletion({
            sessionId,
            enrichedMessage: prepared.userMessage,
            write: (event, data) => {
              if (event === 'delta') markFirstToken();
              write(event, data);
            },
            config: mouth.config,
            system: voiceSystem,
          });
          if (phrased.text) {
            await persistReply(phrased.text);
          }
          write('done', { ok: phrased.ok, turns: 1, mode: 'phrasing' });
          timing('phrasing', { voice: prepared.voice, provider: mouth.config.source });
          return;
        }

        const emit = (e: AssistantEmit) => {
          if (e.type === 'delta') {
            markFirstToken();
            write('delta', { text: e.text });
          } else if (e.type === 'tool_start') write('tool', { name: e.name, status: 'start' });
          else if (e.type === 'tool_end') write('tool', { name: e.name, status: 'end', ok: e.ok });
          else if (e.type === 'ui_tool') write('ui_tool', { name: e.name, input: e.input });
          // The loop opens a UI tool block before its input is parseable and
          // fires this there, so the artifact panel paints a skeleton instead
          // of sitting blank for the whole block. Name only — no input yet.
          else if (e.type === 'ui_tool_start') write('ui_tool_start', { name: e.name });
          else if (e.type === 'error') write('error', { message: e.message });
        };

        // Permissions narrow the advertised kind list; enforcement is per-kind
        // inside the tools themselves.
        const writeTools = buildWriteTools(sessionId, undefined, ctx.permissions);
        const toolDeps = { query: session.query };
        const turnArgs = {
          ctx: toolCtx,
          history,
          userMessage: prepared.userMessage,
          context: context ?? null,
          voiceOverlay: voiceSystem ?? null,
          writeTools,
          toolDeps,
          runToolBatch: session.runBatch,
          emit,
        };

        if (mouth.kind === 'anthropic-tools') {
          const result = await runAssistantTurn(turnArgs);
          if (result.text) {
            await persistReply(result.text);
          }
          write('done', { ok: result.ok, turns: result.turns, mode: 'anthropic' });
          timing('anthropic', { turns: result.turns, tools_used: result.toolsUsed });
          return;
        }

        // ONE call site for the OpenAI wire, for EVERY provider on it. There
        // used to be three blocks here: Grok, the self-hosted slot, and a
        // mouth-only stream beside them — and the triplication is precisely
        // what let the third one keep advertising no tools while the other two
        // ran the full registry. A question about the packing pace sent there
        // could not read the number, so the model invented it.
        const wireDeps = await makeGrokLoopDeps(ctx.organizationId, sessionId, {
          config: mouth.config,
          // A pinned endpoint has no OAuth session to rotate, so the loop's
          // default 401 re-resolve (`ensureGrokChatConfig`) must not fire —
          // only a connected Grok session is `refreshable`.
          ...(mouth.refreshable ? {} : { resolveConfig: async () => mouth.config }),
        });
        const result = await runGrokAssistantTurn(turnArgs, wireDeps);
        if (result.text) {
          await persistReply(result.text);
        }
        write('done', { ok: result.ok, turns: result.turns, mode: mouth.config.source });
        timing('wire_tool_loop', {
          provider: mouth.config.source,
          model: mouth.config.model,
          turns: result.turns,
          tools_used: result.toolsUsed,
          tools_advertised: result.toolsAdvertised,
          advertised_tools: result.advertisedToolNames,
          wire_bytes: result.wireBytes,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        write('error', { message: msg });
        write('done', { ok: false, turns: 0 });
        timing('error', { error: msg.slice(0, 200) });
      } finally {
        // Best-effort: the summarized title, emitted before the stream closes.
        // It runs concurrently with the reply, so it is almost always ready.
        try {
          const title = await titling;
          if (title) write('title', { title });
        } catch {
          /* title is best-effort — never blocks close */
        }
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
