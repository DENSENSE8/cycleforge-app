/**
 * SuperGrok tool loop (Ask plan §17) — the OpenAI-wire twin of agent-loop.ts.
 *
 * Grok used to be mouth-only: `streamHermesCompletion` posted `{model, stream,
 * messages}` and read `delta.content`, so a Grok-connected workspace could ask
 * questions but never reach a tool, and every write turn had to be handed to
 * Anthropic. This module gives Grok the same registry, the same dispatch
 * chokepoint and the same UI-tool namespace the Anthropic loop has.
 *
 * WIRE (decided by the PR-0 probe, 2026-09-05 — plan §17.1 / §23.B):
 * adapter A, `POST {baseURL}/chat/completions` with `stream:true`,
 * `tool_choice:'auto'`, `parallel_tool_calls:true`, `reasoning_effort:'low'`.
 * Measured on grok-4.6 through cli-chat-proxy: the call arrives WHOLE in one
 * `delta.tool_calls` chunk at index 0 with `finish_reason:'tool_calls'`, the
 * `role:'tool'` echo is accepted, and the final sentence starts ~0.7 s later.
 * `/responses` works identically but adds the `store` question (§25 Q1), so it
 * is specified in the plan and not built here.
 *
 * Defensive anyway, because relays differ from the vendor:
 *   • tool calls accumulate by `index` in a Map — some relays start at a
 *     non-zero index (vercel/ai#18333) and an array would misplace them;
 *   • a round with a non-empty call map is a TOOL round whatever
 *     `finish_reason` says (some relays send "stop" — open-webui#21768);
 *   • when a round yields no call but the text carries a `<tool_call>` block,
 *     recoverToolArgsFromContent salvages it rather than showing the operator
 *     a JSON blob;
 *   • a streamed round that 4xx's falls back to a BUFFERED tool round for the
 *     rest of the process (per org, one hour) instead of paying the failure
 *     every turn.
 *
 * Invariants shared with the Anthropic loop:
 *   • org / staff / permissions come from the authenticated ctx — never from
 *     the model or the body; a model-supplied org id in tool arguments is
 *     inert (proven in dispatch.test.ts);
 *   • MAX_TURNS caps the loop;
 *   • tool failures reach the model as content it can route around, never as
 *     a throw;
 *   • `reasoning_content` deltas are dropped — Ask is a mouth an operator
 *     watches mid-carton, and the think phase is dead air.
 */

import { z } from 'zod';
import { listAssistantTools, runAssistantTool } from '@/lib/assistant/tools';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolDeps } from '@/lib/assistant/tools/types';
import { buildWriteToolMap, dispatchToolCall, type WriteToolMap } from '@/lib/assistant/tools/dispatch';
import { toOpenAiFunctionTool } from '@/lib/assistant/tools/openai-schema';
import { subsetAdvertisedTools } from '@/lib/assistant/tool-subsetting';
import {
  MAX_TURNS,
  UI_TOOLS,
  buildContextFragment,
  buildSystemCore,
  collectMintedConnectUrls,
  parseRenderArtifactInput,
  parseRequestConnectionInput,
  type AssistantEmit,
} from './agent-loop';
import type { AssistantPageContext } from './context-store';
import { recoverToolArgsFromContent } from '@/lib/ai/hermes-tool-call';
import {
  createHarmonyTextFilter,
  looksLikeHarmony,
  parseHarmonyToolCalls,
  stripHarmony,
} from '@/lib/ai/harmony';
import { aiRequestHeaders, isSelfHostedAiRuntime, type AiProviderConfig } from '@/lib/ai/provider';
import { ensureGrokChatConfig } from '@/lib/integrations/grok/oauth';
import type { OrgId } from '@/lib/tenancy/constants';

const UI_TOOL_NAMES = new Set(UI_TOOLS.map((t) => t.name));

/** First byte of a round. Past this the proxy is not coming back. */
const FIRST_BYTE_TIMEOUT_MS = 30_000;
/** Whole round, streaming included. Under the route's maxDuration of 300 s. */
const ROUND_TIMEOUT_MS = 120_000;
/** Ask is a mouth, not a coding agent: the proxy default is `high`. */
const REASONING_EFFORT = 'low';
const SESSION_EXPIRED = 'Grok session expired — reconnect in Settings → Integrations.';

// ─── Wire shapes ─────────────────────────────────────────────────────────────

export interface GrokToolCall {
  id: string;
  name: string;
  /** Raw JSON string as the model produced it; parsed by the caller. */
  arguments: string;
}

export type GrokWireMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface GrokTurnParams {
  messages: GrokWireMessage[];
  tools: OpenAiFunctionTool[];
  /** False on the buffered fallback round. */
  stream: boolean;
}

export interface GrokTurnResult {
  text: string;
  toolCalls: GrokToolCall[];
  finishReason: string | null;
}

export interface GrokLoopDeps {
  /** One model round. Streams text through `onTextDelta`; returns the round. */
  streamTurn: (
    params: GrokTurnParams,
    onTextDelta: (text: string) => void,
    /**
     * Fired the first time a streamed tool-call fragment carries a NAME (once
     * per call), before its arguments finish accumulating. Optional so
     * scripted deps may implement two params.
     */
    onToolStart?: (name: string) => void,
  ) => Promise<GrokTurnResult>;
  runTool: typeof runAssistantTool;
  /**
   * True when the resolved provider is a self-hosted OpenAI-wire runtime: the
   * advertisement is subsetted (tool-subsetting.ts) because a local 8B pays
   * the whole tool block as prefill on every round.
   */
  selfHosted?: boolean;
}

export interface RunGrokAssistantTurnArgs {
  ctx: AssistantToolCtx;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userMessage: string;
  context?: AssistantPageContext | null;
  /**
   * Voice overlay chosen by enrichment (carton brief / workspace facts), as
   * text — the same argument the Anthropic loop takes, so both mouths sound
   * like one assistant.
   */
  voiceOverlay?: string | null;
  writeTools?: ReadonlyArray<AssistantToolDef<z.ZodTypeAny, unknown>>;
  /** Tool-registry deps — the per-round tenant session in production. */
  toolDeps?: AssistantToolDeps;
  /** Wraps each round's tool execution (one connection per round, §22 H1). */
  runToolBatch?: <T>(fn: () => Promise<T>) => Promise<T>;
  emit: (event: AssistantEmit) => void;
}

export interface RunGrokAssistantTurnResult {
  ok: boolean;
  text: string;
  turns: number;
  /** Names of every tool actually executed — the [ask-timing] line reports it. */
  toolsUsed: string[];
  /** Tools advertised this turn, for the §18 subsetting budget. */
  toolsAdvertised: number;
  /** The advertised names this turn — logged so latency is attributable. */
  advertisedToolNames: string[];
  wireBytes: number;
  error?: string;
}

// ─── Stream + buffered readers (the default deps) ─────────────────────────────

interface ChatChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    message?: {
      content?: string | null;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
  error?: { message?: string } | string;
}

/** HTTP status carried out of a failed round so the loop can react (401/4xx). */
export class GrokWireError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'GrokWireError';
  }
}

function requestBody(config: AiProviderConfig, params: GrokTurnParams): Record<string, unknown> {
  const selfHosted = isSelfHostedAiRuntime(config);
  return {
    model: config.model,
    stream: params.stream,
    tool_choice: 'auto',
    parallel_tool_calls: true,
    // `reasoning_effort` is a SuperGrok-proxy lever. A self-hosted OpenAI-wire
    // server either ignores it or 400s on it, and a 400 here marks the org's
    // rounds buffered, so it rides only where it is proven.
    ...(selfHosted ? {} : { reasoning_effort: REASONING_EFFORT }),
    // A reasoning model spends the whole round in its think phase and returns
    // `finish_reason:'length'` with nothing to show; measured on the MLX 27B
    // through the tunnel, the tool round still lands but the operator-facing
    // sentence comes back EMPTY ("\n\n") because the prose budget went to the
    // think phase. The mouth-only path has always disabled it (route.ts); the
    // tool loop must too, or the local brain answers with a blank bubble.
    ...(selfHosted ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    messages: params.messages,
    tools: params.tools,
  };
}

async function postRound(
  config: AiProviderConfig,
  sessionId: string | null,
  params: GrokTurnParams,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const roundTimer = setTimeout(() => controller.abort(), ROUND_TIMEOUT_MS);
  const firstByteTimer = setTimeout(() => controller.abort(), FIRST_BYTE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: aiRequestHeaders(config, {
        'X-Source': 'assistant',
        ...(sessionId ? { 'X-Hermes-Session-Id': sessionId } : {}),
      }),
      body: JSON.stringify(requestBody(config, params)),
      signal: controller.signal,
    });
    // Headers are back: the first-byte budget is met, the round budget stands.
    clearTimeout(firstByteTimer);
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      clearTimeout(roundTimer);
      throw new GrokWireError(
        `Grok proxy returned ${res.status}${detail ? `: ${detail}` : ''}`,
        res.status,
        res.status >= 400 && res.status < 500,
      );
    }
    // The caller drains the body; it clears the round timer when done.
    (res as Response & { __roundTimer?: NodeJS.Timeout }).__roundTimer = roundTimer;
    return res;
  } catch (err) {
    clearTimeout(firstByteTimer);
    clearTimeout(roundTimer);
    throw err;
  }
}

function clearRoundTimer(res: Response): void {
  const timer = (res as Response & { __roundTimer?: NodeJS.Timeout }).__roundTimer;
  if (timer) clearTimeout(timer);
}

/**
 * Accumulate `tool_calls` fragments by wire index. Keyed by `index`, never by
 * array position: a relay that starts at index 1 would otherwise drop the call
 * or fuse two calls' arguments into one string.
 *
 * `onName` fires once per call, the moment its name lands — the earliest point
 * a UI tool can be announced to the browser.
 */
function accumulateCalls(onName?: (name: string) => void): {
  add: (tc: { index?: number; id?: string; function?: { name?: string; arguments?: string } }) => void;
  drain: () => GrokToolCall[];
} {
  const byIndex = new Map<number, GrokToolCall>();
  return {
    add(tc) {
      const index = tc.index ?? 0;
      const entry = byIndex.get(index) ?? { id: '', name: '', arguments: '' };
      if (tc.id) entry.id = tc.id;
      if (tc.function?.name) {
        const firstNaming = entry.name.length === 0;
        entry.name = tc.function.name;
        if (firstNaming) onName?.(entry.name);
      }
      if (typeof tc.function?.arguments === 'string') entry.arguments += tc.function.arguments;
      byIndex.set(index, entry);
    },
    drain() {
      return [...byIndex.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, call]) => call)
        .filter((call) => call.name.length > 0);
    },
  };
}

async function readStreamedRound(
  res: Response,
  onTextDelta: (text: string) => void,
  onToolStart?: (name: string) => void,
): Promise<GrokTurnResult> {
  const calls = accumulateCalls(onToolStart);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let finishReason: string | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let json: ChatChunk;
        try {
          json = JSON.parse(payload) as ChatChunk;
        } catch {
          continue; // a split or keep-alive chunk; the next read completes it
        }
        const choice = json.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (delta.content) {
          text += delta.content;
          onTextDelta(delta.content);
        }
        // reasoning_content is deliberately dropped (see the module header).
        for (const tc of delta.tool_calls ?? []) calls.add(tc);
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    }
  } finally {
    clearRoundTimer(res);
  }
  return { text, toolCalls: calls.drain(), finishReason };
}

async function readBufferedRound(res: Response): Promise<GrokTurnResult> {
  let raw: string;
  try {
    raw = await res.text();
  } finally {
    clearRoundTimer(res);
  }
  const json = JSON.parse(raw) as ChatChunk;
  const choice = json.choices?.[0];
  const message = choice?.message ?? {};
  return {
    text: message.content ?? '',
    toolCalls: (message.tool_calls ?? [])
      .map((tc) => ({
        id: tc.id ?? '',
        name: tc.function?.name ?? '',
        arguments: tc.function?.arguments ?? '',
      }))
      .filter((c) => c.name.length > 0),
    finishReason: choice?.finish_reason ?? null,
  };
}

/**
 * Per-org-and-provider memory of "streaming with tools does not work here", so
 * one bad proxy day does not make every turn pay a failed streamed round
 * first. Same shape as provider-health's cache: process-local, one hour, no
 * storage.
 *
 * The key is a SCOPE, not a bare org id: this loop now also drives the local
 * self-hosted brain (route.ts hands it an `ollama` config), and keying by org
 * alone let one MLX 400 push the same org's Grok rounds off streaming for an
 * hour — and vice versa.
 */
const BUFFERED_UNTIL = new Map<string, number>();
const BUFFERED_TTL_MS = 60 * 60 * 1000;

export function grokPrefersBufferedRound(scope: string, now = Date.now()): boolean {
  const until = BUFFERED_UNTIL.get(scope);
  if (!until) return false;
  if (until <= now) {
    BUFFERED_UNTIL.delete(scope);
    return false;
  }
  return true;
}

export function markGrokBufferedFallback(scope: string, now = Date.now()): void {
  BUFFERED_UNTIL.set(scope, now + BUFFERED_TTL_MS);
}

/** Host of an endpoint, for memo keys. Falls back to the raw string. */
function providerHost(baseURL: string): string {
  try {
    return new URL(baseURL).host;
  } catch {
    return baseURL;
  }
}

/** Test seam — the memo is process-global, so suites must be able to clear it. */
export function resetGrokWireMemo(): void {
  BUFFERED_UNTIL.clear();
}

/**
 * Real deps for ONE org: streamed round, with a 401-refresh-once and a
 * buffered-tool-round fallback.
 */
export interface GrokLoopDepsOptions {
  /** Config the route already resolved, so the loop does not re-fetch it. */
  config?: AiProviderConfig | null;
  /** Test seam. */
  fetchImpl?: typeof fetch;
  /** Test seam — the 401 path's one re-resolve. */
  resolveConfig?: (orgId: OrgId) => Promise<AiProviderConfig | null>;
}

export async function makeGrokLoopDeps(
  orgId: OrgId,
  sessionId: string | null,
  options: GrokLoopDepsOptions = {},
): Promise<GrokLoopDeps> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveConfig = options.resolveConfig ?? ensureGrokChatConfig;
  let config = options.config ?? (await resolveConfig(orgId));
  if (!config) {
    throw new Error('Grok (SuperGrok) is not connected for this workspace.');
  }
  let refreshed = false;
  /**
   * Buffered-round memo scope: the org AND the endpoint it is talking to.
   * `AiProviderConfig` carries no provider slot, and the host is the thing
   * that actually differs between the Grok proxy and a local MLX server.
   */
  const memoScope = `${orgId}:${providerHost(config.baseURL)}`;

  const runRound = async (
    params: GrokTurnParams,
    onTextDelta: (text: string) => void,
    onToolStart?: (name: string) => void,
  ): Promise<GrokTurnResult> => {
    const res = await postRound(config!, sessionId, params, fetchImpl);
    return params.stream ? readStreamedRound(res, onTextDelta, onToolStart) : readBufferedRound(res);
  };

  return {
    runTool: runAssistantTool,
    // Subset the advertisement for self-hosted runtimes (tool-subsetting.ts).
    selfHosted: isSelfHostedAiRuntime(config),
    streamTurn: async (params, onTextDelta, onToolStart) => {
      const wantsBuffered = params.stream && grokPrefersBufferedRound(memoScope);
      const first: GrokTurnParams = wantsBuffered ? { ...params, stream: false } : params;
      try {
        return await runRound(first, onTextDelta, onToolStart);
      } catch (err) {
        if (!(err instanceof GrokWireError)) throw err;

        // A 401 mid-loop is a rotated session token, not a broken wire:
        // re-resolve once (ensureGrokChatConfig refreshes) and retry the round.
        // A 401 on the retry is a dead session — the operator has to reconnect,
        // and they need to be told that rather than shown a proxy status code.
        if (err.status === 401) {
          if (refreshed) throw new Error(SESSION_EXPIRED);
          refreshed = true;
          const next = await resolveConfig(orgId);
          if (!next) throw new Error(SESSION_EXPIRED);
          config = next;
          try {
            return await runRound(first, onTextDelta, onToolStart);
          } catch (retryErr) {
            if (retryErr instanceof GrokWireError && retryErr.status === 401) {
              throw new Error(SESSION_EXPIRED);
            }
            throw retryErr;
          }
        }

        // A 4xx on a STREAMED tool round is the §17.5 case: retry this round
        // buffered, and remember it for the rest of the hour.
        if (err.retryable && first.stream) {
          markGrokBufferedFallback(memoScope);
          return runRound({ ...params, stream: false }, onTextDelta, onToolStart);
        }
        throw err;
      }
    },
  };
}

// ─── The loop ────────────────────────────────────────────────────────────────

function parseArguments(raw: string): unknown {
  const text = raw.trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    // A relay that hands back a truncated or narrated argument string still
    // usually contains the object; the registry's Zod parse is the real gate.
    const recovered = recoverToolArgsFromContent(text);
    if (recovered) {
      try {
        return JSON.parse(recovered);
      } catch {
        /* fall through */
      }
    }
    return {};
  }
}

/**
 * A round that produced no `tool_calls` but narrated one in the text — some
 * OpenAI-compatible relays do this when their template parser misses, and
 * `gpt-oss` on `mlx_lm.server` does it for EVERY call (Harmony channels; see
 * `@/lib/ai/harmony`). Returns the salvaged calls, or an empty array when the
 * text is just an answer.
 */
function toolCallsFromNarration(text: string, advertised: ReadonlySet<string>): GrokToolCall[] {
  const harmony = parseHarmonyToolCalls(text, advertised).map((call, i) => ({
    id: `harmony_${i}_${call.name}`,
    name: call.name,
    arguments: call.arguments,
  }));
  if (harmony.length > 0) return harmony;
  if (!text.includes('<tool_call>') && !text.includes('"name"')) return [];
  const raw = recoverToolArgsFromContent(text);
  if (!raw) return [];
  let parsed: { name?: unknown; arguments?: unknown; parameters?: unknown };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return [];
  }
  const name = typeof parsed.name === 'string' ? parsed.name : '';
  if (!name || !advertised.has(name)) return [];
  const args = parsed.arguments ?? parsed.parameters ?? {};
  return [{ id: `narrated_${name}`, name, arguments: JSON.stringify(args) }];
}

export async function runGrokAssistantTurn(
  args: RunGrokAssistantTurnArgs,
  deps: GrokLoopDeps,
): Promise<RunGrokAssistantTurnResult> {
  const toSchema = (t: { name: string; description: string; inputSchema: z.ZodTypeAny }) =>
    toOpenAiFunctionTool(t);

  const serverTools = listAssistantTools(args.ctx).map(toSchema);
  const writeMap: WriteToolMap = buildWriteToolMap(args.ctx, args.writeTools);
  const writeTools = [...writeMap.values()].map(toSchema);
  // UI_TOOLS are Anthropic.Tool (description optional, Anthropic's InputSchema
  // shape); narrow them to the wire helper's source type explicitly.
  const uiTools = UI_TOOLS.map((t) =>
    toOpenAiFunctionTool({
      name: t.name,
      description: t.description ?? '',
      input_schema: t.input_schema as unknown as Record<string, unknown>,
    }),
  );
  const allTools = [...serverTools, ...writeTools, ...uiTools];
  // A self-hosted runtime prefills the ENTIRE advertisement every round —
  // measured 11.8 s first-token at 54 tools vs 1.2 s at 3 on the same card.
  // Subset to the ~8–10 verbs this turn needs; the registry core (finders,
  // the write chokepoint, render_artifact) always rides.
  const subset = deps.selfHosted
    ? subsetAdvertisedTools(args.userMessage, args.context, allTools)
    : null;
  const tools = subset?.tools ?? allTools;
  const advertised = new Set(tools.map((t) => t.function.name));
  const wireBytes = Buffer.byteLength(JSON.stringify(tools), 'utf8');
  const advertisedToolNames = tools.map((t) => t.function.name);

  // One system message: stable core, then the voice overlay enrichment chose,
  // then the volatile page context. Grok has no cache-breakpoint concept, so
  // the ordering is for the reader, not the cache — but keeping the same order
  // as the Anthropic loop means one prompt to reason about, not two.
  const system = [
    buildSystemCore(advertisedToolNames),
    (args.voiceOverlay ?? '').trim(),
    buildContextFragment(args.context),
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');

  const messages: GrokWireMessage[] = [
    { role: 'system', content: system },
    // History was loaded for every turn and then handed only to the Anthropic
    // loop — the Grok branch sent a single-turn conversation every time, which
    // is why Ask forgot the previous sentence. Both loops now get it.
    ...args.history.map((m) =>
      m.role === 'user'
        ? ({ role: 'user', content: m.content } as const)
        : ({ role: 'assistant', content: m.content } as const),
    ),
    { role: 'user', content: args.userMessage },
  ];

  const runBatch = args.runToolBatch ?? (<T,>(fn: () => Promise<T>) => fn());
  const runTool: typeof runAssistantTool = args.toolDeps
    ? (name, input, ctx, toolDeps) => deps.runTool(name, input, ctx, toolDeps ?? args.toolDeps)
    : deps.runTool;

  const turnTexts: string[] = [];
  const toolsUsed: string[] = [];
  /** Connect links this turn's tools actually minted — the pill's provenance. */
  const mintedConnectUrls = new Set<string>();
  /** One "answer the operator" nudge per turn, for a model that only reasons. */
  let nudgedForFinal = false;
  let turns = 0;

  try {
    while (turns < MAX_TURNS) {
      turns += 1;
      if (turnTexts.length > 0) args.emit({ type: 'delta', text: '\n\n' });

      // Harmony models stream their PRIVATE `analysis` channel as ordinary
      // `delta.content`. The filter is a pass-through for every other wire and
      // keeps only the `final` channel for this one, so the operator never
      // watches the model deliberate about which tool it lacks.
      const visible = createHarmonyTextFilter();
      const round = await deps.streamTurn(
        { messages, tools, stream: true },
        (text) => {
          const shown = visible.push(text);
          if (shown) args.emit({ type: 'delta', text: shown });
        },
        (name) => {
          // UI tools only: a server read-tool's start is reported by
          // `tool_start` once its arguments are complete.
          if (UI_TOOL_NAMES.has(name)) args.emit({ type: 'ui_tool_start', name });
        },
      );
      // Release whatever the filter held back for a split marker.
      const tail = visible.flush();
      if (tail) args.emit({ type: 'delta', text: tail });

      // A round is a TOOL round when calls accumulated, whatever finish_reason
      // says — relays have been observed sending "stop" alongside tool_calls.
      let calls = round.toolCalls;
      // Persisted/narrated text is the human-visible text, never the channels.
      let narratedText = stripHarmony(round.text);
      if (calls.length === 0) {
        // Salvage reads the RAW text: the call lives in a suppressed channel.
        const salvaged = toolCallsFromNarration(round.text, advertised);
        if (salvaged.length > 0) {
          calls = salvaged;
          // The narration WAS the call — never show it to the operator.
          narratedText = '';
        }
      }

      if (narratedText.trim().length > 0) turnTexts.push(narratedText);
      if (calls.length === 0) {
        // A Harmony round that called nothing and said nothing in the `final`
        // channel spent itself on `analysis` — measured on the promoted
        // adapter, which ends a tool turn deliberating instead of answering.
        // Before my filter the operator saw that deliberation; without this
        // nudge they see an empty bubble. Ask ONCE, then take what comes.
        if (!nudgedForFinal && turnTexts.length === 0 && looksLikeHarmony(round.text)) {
          nudgedForFinal = true;
          messages.push({
            role: 'user',
            content:
              'Answer the operator now in the final channel: 1-3 plain sentences off the tool results above. If you showed data on the panel, say so.',
          });
          continue;
        }
        break;
      }

      messages.push({
        role: 'assistant',
        content: narratedText || null,
        tool_calls: calls.map((c, i) => ({
          id: c.id || `call_${turns}_${i}`,
          type: 'function' as const,
          function: { name: c.name, arguments: c.arguments || '{}' },
        })),
      });

      // One connection for every tool in this round (§22 H1). UI tools and
      // writes inside it open nothing of their own on this client.
      const results = await runBatch(async () => {
        const out: Array<{ id: string; content: string }> = [];
        for (const [i, call] of calls.entries()) {
          const id = call.id || `call_${turns}_${i}`;
          const input = parseArguments(call.arguments);
          if (UI_TOOL_NAMES.has(call.name)) {
            // Same chokepoint validation as the Anthropic loop: a malformed
            // render_artifact returns as an ERROR tool message the model can
            // repair in-turn; the browser never renders a guess.
            if (call.name === 'render_artifact') {
              const parsed = parseRenderArtifactInput(input);
              if (!parsed.success) {
                out.push({
                  id,
                  content: `ERROR: render_artifact rejected: ${parsed.error.issues
                    .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
                    .join('; ')}. Fix the payload (plain strings/numbers only) and re-emit, or answer in text.`,
                });
                continue;
              }
              args.emit({ type: 'ui_tool', name: call.name, input: { artifact: parsed.data } });
              out.push({ id, content: 'Rendered on the session view panel.' });
              continue;
            }
            // Provenance check, not a scheme check: the pill may only carry a
            // link a connect tool returned in THIS turn.
            if (call.name === 'request_connection') {
              const pill = parseRequestConnectionInput(input, mintedConnectUrls);
              if (!pill.ok) {
                out.push({ id, content: `ERROR: request_connection rejected: ${pill.error}` });
                continue;
              }
              args.emit({ type: 'ui_tool', name: call.name, input: pill.value });
              out.push({ id, content: 'Connect pill shown in the transcript.' });
              continue;
            }
            args.emit({ type: 'ui_tool', name: call.name, input });
            out.push({ id, content: "Dispatched to the user's browser." });
            continue;
          }
          args.emit({ type: 'tool_start', name: call.name, input });
          const result = await dispatchToolCall(call.name, input, args.ctx, writeMap, runTool);
          args.emit({ type: 'tool_end', name: call.name, ok: result.ok });
          toolsUsed.push(call.name);
          if (result.ok) collectMintedConnectUrls(result.data, mintedConnectUrls);
          out.push({
            id,
            content: result.ok ? JSON.stringify(result.data) : `ERROR: ${result.error}`,
          });
        }
        return out;
      });

      for (const r of results) {
        messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
      }
    }

    let text = turnTexts.join('\n\n');
    if (turns >= MAX_TURNS && !text) {
      text = 'I ran out of steps while researching that — try a narrower question.';
    }
    return { ok: true, text, turns, toolsUsed, toolsAdvertised: tools.length, advertisedToolNames, wireBytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'assistant error';
    args.emit({ type: 'error', message });
    return {
      ok: false,
      text: turnTexts.join('\n\n'),
      turns,
      toolsUsed,
      toolsAdvertised: tools.length,
      advertisedToolNames,
      wireBytes,
      error: message,
    };
  }
}
