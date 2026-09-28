import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { type AssistantEmit, type AssistantErrorCode } from '@/lib/assistant/agent-loop';
import { makeGrokLoopDeps, runGrokAssistantTurn, type RoundUsage } from '@/lib/assistant/grok-agent-loop';
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
import { confirmationReply } from '@/lib/assistant/tools/manual-link-tools';
import { loadPendingConfirmation } from '@/lib/assistant/tools/pending-confirmation';
import { buildWriteToolMap, dispatchToolCall } from '@/lib/assistant/tools/dispatch';
import { runAssistantTool } from '@/lib/assistant/tools';
import { splitToolArtifact } from '@/lib/assistant/tool-artifact';
import {
  CLIENT_MSG_ID_RE,
  claimSession,
  loadAssistantHistory,
  persistAssistantTurn,
  rewindSession,
  setSessionTitle,
} from '@/lib/assistant/chat-persistence';
import {
  applyTurnFrame,
  beginTurn,
  compactToolInput,
  parseTurnFrame,
  persistableArtifact,
  settleTurn,
  summarizeToolResult,
  toPersistedTrace,
  type PersistedTurnArtifact,
  type PersistedTurnTrace,
  type TurnUsage,
} from '@/lib/assistant/turn-trace';
import { suggestFollowUps } from '@/lib/assistant/follow-ups';
import { sessionArtifactSchema } from '@/lib/assistant/ui-artifacts';
import { generateSessionTitle } from '@/lib/ai/session-title';
import type { AssistantToolCtx, AssistantToolRunResult } from '@/lib/assistant/tools/types';
import { identifierTurnAnswer, identifierTurnMissed, planIdentifierTurn } from '@/lib/assistant/identifier-turn';
import { reconcileFollowThroughKind, runReconcileFollowThrough } from '@/lib/assistant/reconcile-follow-through';
import { resolveOrgAiChain, type OrgAiConfig } from '@/lib/ai/org-provider';
import { isSelfHostedAiRuntime } from '@/lib/ai/provider';
import { estimateCostMicrocents } from '@/lib/ai/model-pricing';
import { resolveModelContextWindow } from '@/lib/ai/model-context-window';
import { ASSISTANT_ACCESS_MODES } from '@/lib/assistant/access-mode';
import { recordAiUsage } from '@/lib/ai/usage';
import { markProviderUnhealthy } from '@/lib/ai/provider-health';
import { isProviderReachableCached } from '@/lib/ai/provider-reachability';
import { readEvalPin, type EvalPin } from '@/lib/ai/eval-pin';
import { CARTON_ASK_SYSTEM } from '@/lib/assistant/carton-ask-brief';
import { ORG_CHAT_SYSTEM } from '@/lib/assistant/org-chat-facts';
import { logger } from '@/lib/observability/logger';
import { CARD_NUMBER_PLACEHOLDER, CARD_NUMBER_REFUSAL, redactCardNumbers, scanCardNumbers } from '@/lib/assistant/pan-guard';
import { hasStepUp } from '@/lib/auth/stepup';
import { rolesIncludeAdmin } from '@/lib/auth/permissions';

/** `done.mode` of a turn the PAN guard answered — the payment golden asserts it. */
const CARD_REFUSED_MODE = 'card_refused';
/** `done.mode` of a pasted / scanned identifier answered by its read tool, no model. */
const IDENTIFIER_TURN_MODE = 'identifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/assistant/chat — the global English assistant (plan §3.2/§3.3).
 * A tool loop over the org-scoped registry; SSE out (meta → step/delta/
 * reasoning/tool/step_end/ui_tool_start/ui_tool → done → suggestions/title).
 * The step/reasoning contract and its reducer live in `@/lib/assistant/turn-trace`.
 *
 * TIME TO FIRST BYTE IS A LAW HERE: only the rate-limit guard and body
 * validation may run before `new ReadableStream` — they are the two answers
 * that still need a real HTTP status (429/400). Provider resolution, the
 * gateway reachability probe, the session claim, history load and the
 * user-row write all happen inside `start()`, after the first `meta` frame is
 * on the wire. Moving any of them back out re-introduces seconds of blank
 * bubble.
 *
 * SESSIONS ARE PER-STAFF (plan §A.3): `claimSession` creates or touches the
 * thread for its owner before any model work; a foreign or deleted id gets
 * `error{code:'foreign_session'}` and nothing is written or read. A `rewind`
 * (regenerate / edit / retry, plan §B.2–B.3) supersedes rows BEFORE history
 * loads, and history excludes this turn's own user row (`turnIds.user`).
 *
 * `done` ENDS THE TURN for the client (plan K4). `suggestions` and `title`
 * may follow it before the stream closes. A stopped turn (the client aborted
 * or pressed Stop) sends no `done` — nobody is listening — but its partial
 * answer is persisted with `analysis.stopped`.
 *
 * WHICH MOUTH SPEAKS — `chooseAssistantMouth` (assistant-mouth.ts) decides;
 * this route only resolves the endpoint and runs the loop it names:
 *   1. local_ops    deterministic answer, no model at all.
 *   2. wire-tools   runGrokAssistantTurn — the provider-agnostic OpenAI-wire
 *                   tool loop, pointed at the resolved endpoint.
 *
 * The endpoint is the org's chat chain resolved PLATFORM-FIRST: the operator's
 * `AI_CHAT_*` gateway answers, and the tenant's own providers stay behind it
 * as failover. The first REACHABLE candidate takes the turn; the `meta` frame
 * names its `source`, so a failover is never silent. Only when nothing in the
 * chain answers does the turn yield `unconfigured` and an operator-visible
 * sentence.
 *
 * org/staff/permissions come from ctx — never the body.
 */

const ClientMsgIdSchema = z.string().regex(CLIENT_MSG_ID_RE);

const ContextSchema = z
  .object({
    page: z.string().min(1).max(80),
    station: z.string().max(40).nullish(),
    mode: z.string().max(80).nullish(),
    selection: z
      .object({ kind: z.string().max(40), id: z.union([z.string().max(80), z.number().int()]) })
      .nullish(),
    skill: z.string().max(4000).nullish(),
    /** `@` references picked in the composer — this message only (plan §C.1). */
    mentions: z
      .array(
        z
          .object({
            kind: z.enum(['order', 'sku', 'bin']),
            id: z.string().min(1).max(80),
            label: z.string().min(1).max(120),
          })
          .strict(),
      )
      .max(5)
      .nullish(),
    /** Files uploaded from the composer for this message (stored manuals). */
    attachments: z
      .array(
        z
          .object({
            id: z.number().int().positive(),
            kind: z.literal('product_manual'),
            name: z.string().min(1).max(200),
            mime: z.string().max(120),
          })
          .strict(),
      )
      .max(10)
      .nullish(),
  })
  .strict();

const BodySchema = z
  .object({
    sessionId: z.string().regex(/^[A-Za-z0-9._-]{8,80}$/),
    message: z.string().min(1).max(4000),
    context: ContextSchema.nullish(),
    /** Client-minted ids of this turn's two rows (plan K3); the server stores them as `client_id`. */
    turnIds: z.object({ user: ClientMsgIdSchema, assistant: ClientMsgIdSchema }).strict(),
    rewind: z
      .object({ messageId: ClientMsgIdSchema, mode: z.enum(['edit', 'regenerate']) })
      .strict()
      .nullish(),
    /** The composer's mode: `ask` = read-only, enforced at dispatch. Absent = full. */
    accessMode: z.enum(ASSISTANT_ACCESS_MODES).nullish(),
  })
  .strict();

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Everything the pinned mouth needs that costs I/O to learn, plus the chain
 * members BEHIND the chosen one (unprobed) — the in-turn failover order.
 */
type ResolvedProviders = AssistantMouthInputs & { failovers: OrgAiConfig[] };

/**
 * Resolve which endpoint answers: the first reachable candidate of the chat
 * chain (`localAgent` + `platformFirst`, see `resolveOrgAiChain`).
 *
 * This runs INSIDE the SSE stream, never before it — it is network I/O (a
 * vault read plus a reachability probe) and must not hold time-to-first-byte.
 * The probe is memoized per base URL (`provider-reachability`), so a healthy
 * head costs one cached lookup per turn; a later candidate is probed only when
 * everything ahead of it is down.
 */
async function resolveAssistantProviders(organizationId: string, pin: EvalPin | null): Promise<ResolvedProviders> {
  let chain = await resolveOrgAiChain(organizationId, 'chat', undefined, { platformFirst: true, localAgent: true });
  if (pin) {
    const source = pin.provider === 'local' ? 'local_mlx' : 'platform';
    chain = chain
      .filter((c) => c.source === source)
      .slice(0, 1)
      .map((c) => ({ ...c, ...(pin.model ? { model: pin.model } : {}), ...(pin.baseURL ? { baseURL: pin.baseURL } : {}) }));
  }
  for (const [i, candidate] of chain.entries()) {
    if (await isProviderReachableCached(candidate)) {
      return { grokConfig: null, chatConfig: candidate, chatReachable: true, failovers: chain.slice(i + 1) };
    }
  }
  return { grokConfig: null, chatConfig: chain[0] ?? null, chatReachable: false, failovers: [] };
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
  const { sessionId, context, turnIds, rewind, accessMode } = parsed.data;
  // PAN guard FIRST: a card number never reaches a row, a log line, the title
  // model or the turn model (`pan-guard.ts`). Everything below reads `message`.
  const pan = scanCardNumbers(parsed.data.message);
  const message = pan.text;
  const orgId = ctx.organizationId;
  const staffId = ctx.staffId;
  const evalPin = readEvalPin((name) => req.headers.get(name));
  const turnStartedAt = new Date();

  const toolCtx: AssistantToolCtx = {
    organizationId: orgId,
    staffId,
    permissions: ctx.permissions,
    accessMode: accessMode ?? 'full',
    sessionId,
    userMessage: message,
    // Permission-derived step-up follows the same runtime policy as withAuth.
    hasStepUp: async (scope) =>
      ctx.authorizationMode === 'authenticated-only' ||
      rolesIncludeAdmin(ctx.user.roles) ||
      hasStepUp(ctx.session.sid, scope),
  };

  // Stop / client gone: `req.signal` fires on a closed connection, `cancel()`
  // when the reader is dropped. Either one cancels the in-flight model round
  // and ends the loop at its next check (plan §B.1, risk §E: wire both).
  const abort = new AbortController();
  req.signal.addEventListener('abort', () => abort.abort(), { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      abort.abort();
    },
    async start(controller) {
      const write = (event: string, data: unknown) => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          /* client went away */
        }
      };
      const fail = (message: string, code: AssistantErrorCode) => write('error', { message, code });
      // FIRST BYTE, before any I/O at all. Everything that decides the mouth
      // (org brain, gateway probe) and everything that loads or writes chat
      // rows happens below, inside this stream — so the client gets a live
      // turn to render immediately instead of a blank bubble held by a network
      // probe. `provider` is not knowable yet; a second `meta` carries the real
      // one as soon as resolution lands.
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
      const session = createTenantSession(orgId);
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
            org: orgId,
            session: sessionId,
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

      // Provider resolution needs nothing from the session, so it starts
      // under the claim instead of behind it.
      const providersResolving = (async () => {
        const at = Date.now();
        const providers = await resolveAssistantProviders(orgId, evalPin);
        providerMs = Date.now() - at;
        return providers;
      })();
      // A local_ops turn never joins this; keep the rejection handled.
      providersResolving.catch(() => {});

      /** Per-stage ms of this turn — logged on the `ask-timing` line. */
      const stage: Record<string, number> = {};
      // Speculative identifier read: a bare pasted / scanned id is classified
      // and its read tool run WHILE the session is claimed. Both are read-only
      // and org-scoped from ctx; the result is shown only when the claim and
      // the thread's state (below) allow the fast path, and ignored otherwise.
      // A regenerate answers the anchor's stored text, not `message`.
      const identifierRunning =
        pan.redacted === 0 &&
        rewind?.mode !== 'regenerate' &&
        (context?.attachments ?? []).length === 0 &&
        ctx.permissions.has('sku_stock.view')
          ? (async () => {
              const at = Date.now();
              const plan = await planIdentifierTurn(orgId, message);
              stage.identify_ms = Date.now() - at;
              if (!plan) return null;
              const toolAt = Date.now();
              const result = await dispatchToolCall(plan.tool, plan.input, toolCtx, new Map(), runAssistantTool);
              stage.tool_ms = Date.now() - toolAt;
              return { plan, result };
            })().catch(() => null)
          : Promise.resolve(null);
      // History and a pending confirmation are read under the claim too, when
      // no rewind will supersede rows first. History is filtered by the owner,
      // and neither is used unless the claim succeeds.
      const loadHistory = () => {
        const at = Date.now();
        return loadAssistantHistory(orgId, staffId, sessionId, { excludeClientId: turnIds.user })
          .then((rows) => {
            stage.history_ms = Date.now() - at;
            // User rows are PAN-guarded again on the way to the model (rows
            // older than the guard, or any other writer).
            return rows.map((m) => (m.role === 'user' ? { ...m, content: redactCardNumbers(m.content) } : m));
          })
          .catch(() => []);
      };
      const loadPending = () =>
        toolCtx.accessMode !== 'ask'
          ? loadPendingConfirmation(orgId, sessionId, ctx.permissions).catch(() => null)
          : Promise.resolve(null);
      const earlyHistory = rewind ? null : loadHistory();
      const earlyPending = rewind ? null : loadPending();

      /** Set once the session is claimed — rows may be written from then on. */
      let claimed = false;
      /** The first message of a just-created session — summarized into its title after `done`. */
      let titleSource: string | null = null;
      let userPersisted: Promise<void> = Promise.resolve();
      const persistReply = async (
        text: string,
        trace: PersistedTurnTrace | null = null,
        error = false,
      ) => {
        if (!claimed) return;
        await userPersisted;
        await persistAssistantTurn(orgId, staffId, sessionId, {
          role: 'assistant',
          content: text,
          clientId: turnIds.assistant,
          analysis: trace,
          error,
        });
      };

      try {
        // Ownership first: a foreign or deleted thread is refused before any
        // row is written, any read is USED, or any model token spent.
        const claimAt = Date.now();
        const claim = await claimSession(orgId, staffId, sessionId, message);
        stage.claim_ms = Date.now() - claimAt;
        if (!claim.ok) {
          fail('This conversation is not available.', 'foreign_session');
          write('done', { ok: false, turns: 0 });
          timing('foreign_session');
          return;
        }
        claimed = true;

        // Rewind BEFORE the history read and the user-row insert, so neither
        // sees rows this turn supersedes. Regenerate answers the anchor's
        // STORED text (authoritative) and adds no user row; edit supersedes the
        // anchor too and inserts the new text. An unknown anchor (the original
        // send died before its row landed) is a fresh send — the insert is
        // idempotent on `turnIds.user`.
        let userText = message;
        // A client that already redacted (useAssistantChat) sends the placeholder: refuse that too.
        let cardNumbers = pan.redacted > 0 ? pan.redacted : message.includes(CARD_NUMBER_PLACEHOLDER) ? 1 : 0;
        let insertUser = true;
        if (rewind) {
          const anchor = await rewindSession(orgId, staffId, sessionId, rewind);
          if (anchor && rewind.mode === 'regenerate') {
            // A stored row older than the PAN guard is guarded on its way back in.
            const scanned = scanCardNumbers(anchor.anchorContent);
            userText = scanned.text;
            cardNumbers = scanned.redacted;
            insertUser = false;
          }
        }

        // The user's own row is a write nobody is waiting to read: starting it
        // here and awaiting it later keeps it off the critical path. The two
        // rows must still land user-then-assistant, so every assistant write
        // goes through `persistReply`, which joins this first.
        if (insertUser) {
          userPersisted = persistAssistantTurn(orgId, staffId, sessionId, {
            role: 'user',
            content: userText,
            clientId: turnIds.user,
          });
        }
        // First message → the session was just created with a provisional
        // title. It is summarized in `finally`, AFTER `done`: on a self-hosted
        // box the title call and the turn share one model, and a concurrent
        // title request steals the turn's decode. A rewind never re-titles.
        if (claim.created) titleSource = userText;

        // Card-number refusal — deterministic, no model, no tool. The redacted
        // text is what was persisted; the reply says where payment happens.
        if (cardNumbers > 0) {
          markFirstToken();
          write('delta', { text: CARD_NUMBER_REFUSAL });
          await persistReply(CARD_NUMBER_REFUSAL);
          write('done', { ok: true, turns: 0, mode: CARD_REFUSED_MODE });
          timing(CARD_REFUSED_MODE, { cardNumbersRemoved: cardNumbers });
          return;
        }

        /**
         * A turn ONE tool answers without a model (the identifier fast path,
         * a manual-link confirmation): the same frames, trace, artifacts and
         * row a model turn leaves — a reopened thread and its follow-ups
         * cannot tell the difference. No usage: the context ring keeps
         * reading the thread's last MODEL turn instead of a zero.
         */
        const toolOnlyTurn = async (
          tool: string,
          input: Record<string, unknown>,
          result: AssistantToolRunResult,
          text: string,
          mode: string,
        ) => {
          let trace = beginTurn(startedAt);
          const out = (event: string, data: Record<string, unknown>) => {
            write(event, data);
            const folded = parseTurnFrame(event, data);
            if (folded) trace = applyTurnFrame(trace, folded, Date.now());
          };
          out('step', { index: 1 });
          out('tool', { name: tool, status: 'start', input: compactToolInput(input) });
          out('tool', { name: tool, status: 'end', ok: result.ok, result: result.ok ? summarizeToolResult(result.data) : null });
          const carried = result.ok ? splitToolArtifact(result.data) : null;
          const kept: PersistedTurnArtifact[] = [];
          if (carried) {
            write('ui_tool', { name: 'render_artifact', input: { artifact: carried.artifact, producedBy: carried.tool } });
            const persisted = persistableArtifact(carried.artifact);
            if (persisted) kept.push({ artifact: persisted, producedBy: carried.tool });
          }
          out('step_end', { index: 1, toolRound: true });
          markFirstToken();
          out('step', { index: 2 });
          out('delta', { text });
          out('step_end', { index: 2, toolRound: false });
          const suggestions = result.ok
            ? suggestFollowUps({ question: userText, tools: [{ name: tool, input }], artifacts: kept, mentions: context?.mentions })
            : [];
          // `done` first: the operator is waiting on the screen, not on the
          // row. The row lands right after (user row first, via persistReply).
          write('done', { ok: result.ok, turns: 0, mode });
          if (suggestions.length > 0) write('suggestions', { messageId: turnIds.assistant, items: suggestions });
          stage.done_ms = Date.now() - startedAt;
          const persistAt = Date.now();
          await persistReply(text, toPersistedTrace(settleTurn(trace, Date.now()), { artifacts: kept, ...(suggestions.length ? { suggestions } : {}) }));
          stage.persist_ms = Date.now() - persistAt;
          timing(mode, { tool, ok: result.ok, ...stage });
        };

        // History excludes this turn's own user row: it rides as `userMessage`.
        const historyLoading = earlyHistory ?? loadHistory();
        // A write proposed on an earlier turn and awaiting "yes" (a manual
        // link, a phone-order draft) — only a Full-access turn can confirm it.
        const pendingLoading = earlyPending ?? loadPending();
        // Enrichment (local_ops, voice briefs) needs nothing the fast path
        // decides, so it runs alongside it instead of after it.
        const enrichStartedAt = Date.now();
        const preparing = enrichAssistantTurn(orgId, userText, { db: session }, context ?? null, staffId).then((p) => {
          enrichMs = Date.now() - enrichStartedAt;
          return p;
        });
        preparing.catch(() => {});

        // Identifier fast path — the whole message is one pasted or scanned
        // identifier: its read tool already ran (speculatively, under the
        // claim) and its record goes on screen with a sentence built from the
        // tool's own data. No model (`identifier-turn.ts`). Not taken when the
        // thread is mid-conversation about something the id may ANSWER — a
        // pending confirmation, or the assistant's last message asked a
        // question ("what is the customer's phone?").
        const [identified, earlier, pendingEarly] = await Promise.all([identifierRunning, historyLoading, pendingLoading]);
        const lastReply = earlier.findLast((m) => m.role === 'assistant')?.content.trim() ?? '';
        if (identified && !pendingEarly && !lastReply.endsWith('?')) {
          const { plan, result } = identified;
          const answer = result.ok ? identifierTurnAnswer(result.data) : null;
          const handled = answer !== null && result.ok && !(plan.onlyIfFound && identifierTurnMissed(result.data));
          if (handled) {
            await toolOnlyTurn(plan.tool, plan.input, result, answer, IDENTIFIER_TURN_MODE);
            return;
          }
        }

        const prepared = await preparing;

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

        // Confirmation fast path — a bare yes / no answering a write this
        // thread proposed on an earlier turn. It runs that tool through the
        // same dispatch gate (access mode, permission) and review path a model
        // call would; no model reads "yes" and guesses.
        const pendingWrite = pendingEarly;
        const reply = pendingWrite ? confirmationReply(userText) : null;
        if (pendingWrite && reply) {
          const input = { action: reply };
          const writeMap = buildWriteToolMap(
            toolCtx,
            buildWriteTools(sessionId, undefined, ctx.permissions, { startedAt: turnStartedAt }),
          );
          const result = await dispatchToolCall(pendingWrite.toolName, input, toolCtx, writeMap, runAssistantTool);
          const carried = result.ok ? splitToolArtifact(result.data) : null;
          const data = result.ok ? result.data : null;
          const toolSummary =
            data && typeof data === 'object' && 'summary' in data && typeof data.summary === 'string' ? data.summary : null;
          const summary = carried?.modelData.summary ?? toolSummary ?? (result.ok ? 'Done.' : `Not done — ${result.error}`);
          await toolOnlyTurn(pendingWrite.toolName, input, result, summary, 'confirmation');
          return;
        }

        // Reconcile chips that act ("Import the missing ones as purchase
        // orders" / "Add the missing ones as new orders"): the refs come from
        // this thread's persisted reconcile table, never the model, and the
        // draft opens here prefilled (`reconcile-follow-through.ts`).
        const followKind = reconcileFollowThroughKind(userText);
        const followed = followKind
          ? await runReconcileFollowThrough(followKind, orgId, sessionId, (tool, input) =>
              dispatchToolCall(tool, input, toolCtx, new Map(), runAssistantTool),
            ).catch(() => null)
          : null;
        if (followed) {
          await toolOnlyTurn(followed.tool, followed.input, followed.result, followed.text, 'reconcile_follow_through');
          return;
        }

        const [providers, history] = await Promise.all([providersResolving, historyLoading]);
        const pendingLink = pendingWrite?.note ?? null;

        const voiceSystem =
          prepared.voice === 'carton'
            ? CARTON_ASK_SYSTEM
            : prepared.voice === 'org_chat'
              ? ORG_CHAT_SYSTEM
              : undefined;

        const mouth = chooseAssistantMouth(providers);

        if (mouth.kind === 'unconfigured') {
          // This used to be a 503. It cannot be one any more — the response
          // headers left with the first `meta` frame — and that is an upgrade,
          // not a compromise: the client renders an `error` event straight
          // into the assistant bubble, so the operator now reads the sentence
          // in the conversation instead of getting a silently failed fetch.
          const text =
            'The local assistant model is not reachable for this workspace. Point OLLAMA_BASE_URL / OLLAMA_MODEL at a running OpenAI-compatible endpoint (vLLM / Ollama / MLX) and try again.';
          fail(text, 'provider_unreachable');
          await persistReply(text, null, true);
          write('done', { ok: false, turns: 0 });
          timing('unconfigured');
          return;
        }

        // The real mouth, now that it is known. It names the PROVIDER, not the
        // transport, so a gateway turn and a local turn are distinguishable.
        write('meta', { sessionId, provider: mouth.config.source });

        // The SAME reducer the browser runs folds every frame written here,
        // so the trace persisted on the assistant row is exactly the thinking
        // history the operator watched stream (`turn-trace.ts`).
        let turn = beginTurn(startedAt);
        /** Server tools this turn ran, with their arguments — the follow-up engine's input. */
        const toolsRun: Array<{ name: string; input: unknown }> = [];
        /** Table / record cards painted this turn, for persistence and follow-ups (plan §C.3). */
        const artifacts: PersistedTurnArtifact[] = [];
        // An attempt's opening `step` is HELD until the attempt shows anything
        // else. If the endpoint fails before that, the turn is replayed on the
        // next chain candidate, and the operator sees one turn — not a dead
        // step followed by a second one.
        let heldStep: Record<string, unknown> | null = null;
        const out = (event: string, data: Record<string, unknown>, fold: boolean) => {
          if (heldStep) {
            const step = heldStep;
            heldStep = null;
            out('step', step, true);
          }
          write(event, data);
          const folded = fold ? parseTurnFrame(event, data) : null;
          if (folded) turn = applyTurnFrame(turn, folded, Date.now());
        };
        const frame = (event: string, data: Record<string, unknown>) => out(event, data, true);
        const keepArtifact = (input: unknown) => {
          const payload = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
          const valid = sessionArtifactSchema.safeParse(payload.artifact);
          const artifact = valid.success ? persistableArtifact(valid.data) : null;
          if (!artifact) return;
          artifacts.push({
            artifact,
            producedBy: typeof payload.producedBy === 'string' ? payload.producedBy : null,
          });
        };
        const emit = (e: AssistantEmit) => {
          if (e.type === 'delta') {
            markFirstToken();
            frame('delta', { text: e.text });
          } else if (e.type === 'reasoning') frame('reasoning', { text: e.text });
          else if (e.type === 'step') {
            if (e.index === 1) heldStep = { index: e.index };
            else frame('step', { index: e.index });
          } else if (e.type === 'step_end') frame('step_end', { index: e.index, toolRound: e.toolRound });
          else if (e.type === 'tool_start') {
            toolsRun.push({ name: e.name, input: e.input });
            frame('tool', { name: e.name, status: 'start', input: compactToolInput(e.input) });
          } else if (e.type === 'tool_end') frame('tool', { name: e.name, status: 'end', ok: e.ok, result: e.result });
          else if (e.type === 'ui_tool') {
            if (e.name === 'render_artifact') keepArtifact(e.input);
            out('ui_tool', { name: e.name, input: e.input }, false);
          }
          // The loop opens a UI tool block before its input is parseable and
          // fires this there, so the artifact panel paints a skeleton instead
          // of sitting blank for the whole block. Name only — no input yet.
          else if (e.type === 'ui_tool_start') out('ui_tool_start', { name: e.name }, false);
          else if (e.type === 'error') out('error', { message: e.message, code: e.code ?? 'internal' }, false);
        };

        // Permissions narrow the advertised kind list; enforcement is per-kind
        // inside the tools themselves.
        const writeTools = buildWriteTools(sessionId, undefined, ctx.permissions, { startedAt: turnStartedAt });
        const toolDeps = { query: session.query, releaseBatch: session.release };
        const turnArgs = {
          ctx: toolCtx,
          history,
          // The pending-link note rides WITH the user's reply: a small local
          // model reads its own last question in history and asks for ids it
          // does not need unless the answer and the instruction arrive together.
          userMessage: pendingLink ? `${prepared.userMessage}\n\n[${pendingLink}]` : prepared.userMessage,
          context: context ?? null,
          voiceOverlay: voiceSystem ?? null,
          writeTools,
          toolDeps,
          runToolBatch: session.runBatch,
          emit,
          signal: abort.signal,
        };
        const loopOptions = {
          signal: abort.signal,
          metadata: { org: orgId, staff: staffId, session: sessionId },
        };

        // ONE call site for the OpenAI wire (see assistant-mouth.ts).
        //
        // IN-TURN FAILOVER: an endpoint that fails before the operator saw
        // anything (gateway quota 429, 5xx, refused model id, network) is
        // demoted and the turn replays on the next REACHABLE chain member; a
        // fresh `meta` names it. Chat must not die when a free quota runs out.
        const pending = [...providers.failovers];
        let config: OrgAiConfig = mouth.config;
        /** Tokens across every attempt — a failed-over attempt may still have been billed. */
        let spent: RoundUsage | null = null;
        const tallyUsage = (u: RoundUsage | null) => {
          if (!u) return;
          spent = {
            promptTokens: (spent?.promptTokens ?? 0) + u.promptTokens,
            completionTokens: (spent?.completionTokens ?? 0) + u.completionTokens,
          };
        };
        let result = await runGrokAssistantTurn(
          { ...turnArgs, canFailOver: pending.length > 0 },
          await makeGrokLoopDeps(orgId, sessionId, {
            ...loopOptions,
            config,
            // A pinned endpoint has no OAuth session to rotate, so the loop's
            // default 401 re-resolve must never fire.
            ...(mouth.refreshable ? {} : { resolveConfig: async () => mouth.config }),
          }),
        );
        tallyUsage(result.usage);
        let exhausted = false;
        while (result.failedOver) {
          markProviderUnhealthy(orgId, config.source, 'chat');
          const failed = config;
          let next: OrgAiConfig | null = null;
          while (!next && pending.length > 0) {
            const candidate = pending.shift()!;
            if (await isProviderReachableCached(candidate)) next = candidate;
          }
          logger.warn(
            { org: orgId, from: failed.source, to: next?.source ?? null, error: (result.error ?? '').slice(0, 200) },
            'ask-failover',
          );
          if (!next) {
            heldStep = null;
            exhausted = true;
            fail(result.error ?? 'assistant error', 'provider_unreachable');
            break;
          }
          config = next;
          const pinned = next;
          heldStep = null;
          write('meta', { sessionId, provider: pinned.source });
          result = await runGrokAssistantTurn(
            { ...turnArgs, canFailOver: pending.length > 0 },
            await makeGrokLoopDeps(orgId, sessionId, { ...loopOptions, config: pinned, resolveConfig: async () => pinned }),
          );
          tallyUsage(result.usage);
        }

        const tokens = spent as RoundUsage | null;
        const totalMs = Date.now() - startedAt;
        const lastRound = result.lastRoundUsage;
        const usage: TurnUsage = {
          provider: config.source,
          model: config.model,
          inputTokens: tokens?.promptTokens ?? null,
          outputTokens: tokens?.completionTokens ?? null,
          // A self-hosted model costs the operator nothing per token.
          costMicrocents: isSelfHostedAiRuntime(config)
            ? 0
            : tokens
              ? estimateCostMicrocents(config.model, tokens.promptTokens, tokens.completionTokens)
              : null,
          firstTokenMs,
          totalMs,
          rounds: result.turns,
          contextTokens: lastRound ? lastRound.promptTokens + lastRound.completionTokens : null,
          contextWindow: await resolveModelContextWindow(config),
        };
        recordAiUsage({
          orgId,
          capability: 'chat',
          source: config.source,
          model: config.model,
          context: 'assistant_turn',
          inputTokens: tokens?.promptTokens ?? 0,
          outputTokens: tokens?.completionTokens ?? 0,
          costMicrocents: usage.costMicrocents,
          staffId,
          sessionId,
          latencyMs: totalMs,
          gatewayLogId: result.gatewayLogId,
        });

        const settled = settleTurn(turn, Date.now());
        const logExtra = {
          ...stage,
          provider: config.source,
          model: config.model,
          turns: result.turns,
          tools_used: result.toolsUsed,
          tools_advertised: result.toolsAdvertised,
          advertised_tools: result.advertisedToolNames,
          wire_bytes: result.wireBytes,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cost_microcents: usage.costMicrocents,
          gateway_log_id: result.gatewayLogId,
        };

        // Stopped: keep what was said, mark it, and say nothing more — the
        // client already settled the bubble on its own abort.
        if (result.stopped) {
          // Log first: nothing after an abort may stand between the stop and
          // its `mode=stopped` line (the persist is an awaited DB round trip).
          timing('stopped', logExtra);
          await persistReply(result.text, toPersistedTrace(settled, { stopped: true, artifacts, usage }));
          return;
        }

        if (!result.ok || exhausted) {
          // A reopened thread shows the failure (and its Retry); the history
          // loader skips error rows, so the model never reads it back.
          await persistReply(result.error ?? 'assistant error', toPersistedTrace(settled, { usage }), true);
          write('done', { ok: false, turns: result.turns, mode: config.source, usage });
          timing('wire_tool_loop_error', { ...logExtra, error: (result.error ?? '').slice(0, 200) });
          return;
        }

        const suggestions = suggestFollowUps({
          question: userText,
          tools: toolsRun,
          artifacts,
          mentions: context?.mentions,
        });
        // A turn that worked but found no answer still has a history worth
        // reopening — the row keeps its steps with empty answer text.
        if (result.text || settled.steps.length > 0) {
          await persistReply(result.text, toPersistedTrace(settled, { suggestions, artifacts, usage }));
        }
        write('done', { ok: true, turns: result.turns, mode: config.source, usage });
        if (suggestions.length > 0) write('suggestions', { messageId: turnIds.assistant, items: suggestions });
        timing('wire_tool_loop', logExtra);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (abort.signal.aborted) {
          timing('stopped', { error: msg.slice(0, 200) });
          return;
        }
        fail(msg, 'internal');
        await persistReply(msg, null, true).catch(() => {});
        write('done', { ok: false, turns: 0 });
        timing('error', { error: msg.slice(0, 200) });
      } finally {
        // Best-effort: the summarized title, after `done` — the client is
        // already idle and keeps reading trailing frames until close.
        if (titleSource !== null) {
          try {
            const title = await generateSessionTitle(orgId, titleSource);
            await setSessionTitle(orgId, staffId, sessionId, title);
            write('title', { title });
          } catch {
            /* title is best-effort — never blocks close */
          }
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
      'X-Accel-Buffering': 'no',
    },
  });
}, { permission: 'assistant.chat' });
