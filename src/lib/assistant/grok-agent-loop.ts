/**
 * The OpenAI-wire tool loop (Ask plan §17) — the twin of agent-loop.ts, which
 * speaks Anthropic's native tool-use protocol instead.
 *
 * Grok used to be mouth-only: `streamHermesCompletion` posted `{model, stream,
 * messages}` and read `delta.content`, so a Grok-connected workspace could ask
 * questions but never reach a tool, and every write turn had to be handed to
 * Anthropic. This module gives the wire the same registry, the same dispatch
 * chokepoint and the same UI-tool namespace the Anthropic loop has.
 *
 * IT IS NOT GROK-SPECIFIC, despite the file name. Nothing here branches on a
 * vendor: `requestBody` keys its two optional levers off
 * `isSelfHostedAiRuntime` (a capability), Harmony handling is content-sniffed
 * and a no-op on every other wire, and the endpoint arrives as an
 * `AiProviderConfig`. Since 2026-09-06 the route has exactly ONE call site
 * feeding it every reachable member of the chain — Grok, the tenant's
 * self-hosted slot, `ai_gateway`, `openai`, `anthropic`-compat and the
 * `platform` leaf. Four of those six used to fall through to the mouth-only
 * path and could therefore never call a verb or paint the artifact canvas;
 * see `assistant-mouth.ts`. Do not add a second loop for a new provider.
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
 *   • reasoning never reaches the answer: `reasoning_content` / `reasoning`
 *     deltas, `<think>` blocks and the Harmony `analysis` channel stream as
 *     `reasoning` frames, which the chat folds into the turn's COLLAPSED
 *     thinking history — an operator mid-carton reads the answer, and opens
 *     the work only when they want it;
 *   • a tool call the model writes AS TEXT (`[name(args)]`, `<tool_call>`,
 *     `<|python_tag|>`, bare JSON) is scrubbed before `delta` by the round's
 *     visible-text filter (`@/lib/ai/visible-text`) — raw call syntax never
 *     reaches the chat;
 *   • every round is bracketed by `step` / `step_end {toolRound}` so the
 *     client can tell narration ("Let me check…") from the answer.
 */

import { z } from 'zod';
import { listAssistantTools, runAssistantTool } from '@/lib/assistant/tools';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolDeps } from '@/lib/assistant/tools/types';
import { buildWriteToolMap, dispatchToolCall, type WriteToolMap } from '@/lib/assistant/tools/dispatch';
import { toOpenAiFunctionTool, type OpenAiFunctionTool } from '@/lib/assistant/tools/openai-schema';
import { subsetAdvertisedTools } from '@/lib/assistant/tool-subsetting';
import { accessModeAllowsUiTool, accessModeFragment, askOnlyRefusal } from '@/lib/assistant/access-mode';
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
import { summarizeToolResult } from './turn-trace';
import { recoverToolArgsFromContent } from '@/lib/ai/hermes-tool-call';
import {
  makeRenderArtifactCap,
  RENDER_ARTIFACT_CAP_PER_TURN,
  splitToolArtifact,
} from '@/lib/assistant/tool-artifact';
import { takeDeviceAction } from '@/lib/assistant/tool-device-action';
import { looksLikeHarmony, parseHarmonyToolCalls } from '@/lib/ai/harmony';
import { panelClaimCorrection, type TurnShown } from '@/lib/assistant/panel-honesty';
import { artifactPlacement } from '@/lib/assistant/artifact-placement';
import { createVisibleTextFilter, type EchoedToolCall, type VisibleTextSlice } from '@/lib/ai/visible-text';
import { humanizeToolInput, toolActivityPhrase } from '@/lib/assistant/tool-activity';
import { aiRequestHeaders, isSelfHostedAiRuntime, type AiProviderConfig } from '@/lib/ai/provider';
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

/** Token counts one round reported (`usage`), when the endpoint reports them. */
export interface RoundUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface GrokTurnResult {
  text: string;
  toolCalls: GrokToolCall[];
  finishReason: string | null;
  /** Null when the endpoint sent no `usage` (older relays ignore `stream_options`). */
  usage?: RoundUsage | null;
  /** Cloudflare AI Gateway's `cf-aig-log-id` for this round — links a turn to CF's cost row. */
  gatewayLogId?: string | null;
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
    /** The provider's own reasoning field (`reasoning_content` / `reasoning`). */
    onReasoningDelta?: (text: string) => void,
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
  /**
   * The route has another chain candidate behind this endpoint. An endpoint
   * failure (`isEndpointFailure`) before anything but the opening `step`
   * reached the operator then returns `failedOver: true` WITHOUT emitting the
   * error, so the route can replay the turn on the next candidate.
   */
  canFailOver?: boolean;
  /**
   * The operator stopped the turn (or the client went away). Checked at every
   * round head and before each tool batch; the in-flight round is cancelled
   * through the deps' own signal (`GrokLoopDepsOptions.signal`).
   */
  signal?: AbortSignal;
}

export interface RunGrokAssistantTurnResult {
  ok: boolean;
  /**
   * The ANSWER only — the round that ended the turn without calls. Tool
   * rounds' narration lives in the thinking history, not here.
   */
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
  /** The endpoint failed before the operator saw anything; try the next candidate. */
  failedOver?: true;
  /** The turn was aborted; `text` is the answer so far. */
  stopped?: true;
  /** Summed over every round that reported usage; null when none did. */
  usage: RoundUsage | null;
  /** The LAST reporting round alone — its prompt is the thread's live context size. */
  lastRoundUsage: RoundUsage | null;
  /** The LAST round's gateway log id (CF AI Gateway only). */
  gatewayLogId: string | null;
}

// ─── Stream + buffered readers (the default deps) ─────────────────────────────

interface ChatChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      /** DeepSeek / vLLM / Workers AI spelling. */
      reasoning_content?: string | null;
      /** OpenRouter / Ollama spelling. */
      reasoning?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
  /** The trailing `stream_options.include_usage` chunk (no choices), or a buffered body's usage. */
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string } | string;
}

function readUsage(json: ChatChunk): RoundUsage | null {
  const u = json.usage;
  if (!u || typeof u.prompt_tokens !== 'number' || typeof u.completion_tokens !== 'number') return null;
  return { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens };
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
    // gpt-oss has no "off" — its Harmony template takes `reasoning_effort`
    // instead: `low` cut the analysis channel ~30% per round on the local box
    // (64 → 46 tokens on a two-tool routing prompt, 2026-09-27), and decode
    // (~55 tok/s) is where a local turn spends its seconds. A template that
    // does not know a kwarg ignores it.
    ...(selfHosted ? { chat_template_kwargs: { enable_thinking: false, reasoning_effort: 'low' } } : {}),
    // The token count rides the stream's last chunk (no choices). Proven on
    // mlx_lm.server 0.31 and the CF compat gateway; a relay that ignores it
    // just leaves `usage` null.
    ...(params.stream ? { stream_options: { include_usage: true } } : {}),
    messages: params.messages,
    tools: params.tools,
  };
}

/** Per-turn wire extras `postRound` threads onto every round. */
interface RoundWire {
  signal?: AbortSignal;
  /** `cf-aig-metadata` — sent to a Cloudflare AI Gateway host only. */
  metadata?: Record<string, string | number | boolean>;
}

async function postRound(
  config: AiProviderConfig,
  sessionId: string | null,
  params: GrokTurnParams,
  fetchImpl: typeof fetch,
  wire: RoundWire = {},
): Promise<Response> {
  const controller = new AbortController();
  const roundTimer = setTimeout(() => controller.abort(), ROUND_TIMEOUT_MS);
  const firstByteTimer = setTimeout(() => controller.abort(), FIRST_BYTE_TIMEOUT_MS);
  const signal = wire.signal ? AbortSignal.any([controller.signal, wire.signal]) : controller.signal;
  const metadata: Record<string, string> =
    wire.metadata && providerHost(config.baseURL) === 'gateway.ai.cloudflare.com'
      ? { 'cf-aig-metadata': JSON.stringify(wire.metadata) }
      : {};
  try {
    const res = await fetchImpl(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: aiRequestHeaders(config, {
        'X-Source': 'assistant',
        ...(sessionId ? { 'X-Hermes-Session-Id': sessionId } : {}),
        ...metadata,
      }),
      body: JSON.stringify(requestBody(config, params)),
      signal,
    });
    // Headers are back: the first-byte budget is met, the round budget stands.
    clearTimeout(firstByteTimer);
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      clearTimeout(roundTimer);
      throw new GrokWireError(
        `Model endpoint returned ${res.status}${detail ? `: ${detail}` : ''}`,
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
  onReasoningDelta?: (text: string) => void,
): Promise<GrokTurnResult> {
  const gatewayLogId = res.headers.get('cf-aig-log-id');
  const calls = accumulateCalls(onToolStart);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let finishReason: string | null = null;
  let usage: RoundUsage | null = null;
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
        // The usage chunk has no choices: read it before skipping those.
        usage = readUsage(json) ?? usage;
        const choice = json.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (delta.content) {
          text += delta.content;
          onTextDelta(delta.content);
        }
        const reasoning = delta.reasoning_content ?? delta.reasoning;
        if (reasoning) onReasoningDelta?.(reasoning);
        for (const tc of delta.tool_calls ?? []) calls.add(tc);
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    }
  } finally {
    clearRoundTimer(res);
  }
  return { text, toolCalls: calls.drain(), finishReason, usage, gatewayLogId };
}

/**
 * A buffered round arrives whole, so it is published whole — through the SAME
 * callbacks a streamed round uses. Without that its answer never reached the
 * browser at all (only the persisted row), and it would skip the loop's
 * visible-text filter.
 */
async function readBufferedRound(
  res: Response,
  onTextDelta: (text: string) => void,
  onReasoningDelta?: (text: string) => void,
): Promise<GrokTurnResult> {
  let raw: string;
  try {
    raw = await res.text();
  } finally {
    clearRoundTimer(res);
  }
  const json = JSON.parse(raw) as ChatChunk;
  const choice = json.choices?.[0];
  const message = choice?.message ?? {};
  const reasoning = message.reasoning_content ?? message.reasoning;
  if (reasoning) onReasoningDelta?.(reasoning);
  const text = message.content ?? '';
  if (text) onTextDelta(text);
  return {
    text,
    toolCalls: (message.tool_calls ?? [])
      .map((tc) => ({
        id: tc.id ?? '',
        name: tc.function?.name ?? '',
        arguments: tc.function?.arguments ?? '',
      }))
      .filter((c) => c.name.length > 0),
    finishReason: choice?.finish_reason ?? null,
    usage: readUsage(json),
    gatewayLogId: res.headers.get('cf-aig-log-id'),
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
  /** Cancels the in-flight round — the route's stop / client-gone signal. */
  signal?: AbortSignal;
  /** Gateway-side filter tags (`cf-aig-metadata`), e.g. org / staff / session. */
  metadata?: Record<string, string | number | boolean>;
}

export async function makeGrokLoopDeps(
  orgId: OrgId,
  sessionId: string | null,
  options: GrokLoopDepsOptions = {},
): Promise<GrokLoopDeps> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveConfig = options.resolveConfig ?? (async () => null);
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
    onReasoningDelta?: (text: string) => void,
  ): Promise<GrokTurnResult> => {
    const res = await postRound(config!, sessionId, params, fetchImpl, {
      signal: options.signal,
      metadata: options.metadata,
    });
    return params.stream
      ? readStreamedRound(res, onTextDelta, onToolStart, onReasoningDelta)
      : readBufferedRound(res, onTextDelta, onReasoningDelta);
  };

  return {
    runTool: runAssistantTool,
    // Subset the advertisement for self-hosted runtimes (tool-subsetting.ts).
    selfHosted: isSelfHostedAiRuntime(config),
    streamTurn: async (params, onTextDelta, onToolStart, onReasoningDelta) => {
      const wantsBuffered = params.stream && grokPrefersBufferedRound(memoScope);
      const first: GrokTurnParams = wantsBuffered ? { ...params, stream: false } : params;
      try {
        return await runRound(first, onTextDelta, onToolStart, onReasoningDelta);
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
            return await runRound(first, onTextDelta, onToolStart, onReasoningDelta);
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
          return runRound({ ...params, stream: false }, onTextDelta, onToolStart, onReasoningDelta);
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

/**
 * The thinking-history line for a call the model wrote as text and nobody
 * ran — in operator words (`toolActivityPhrase`, humanised arguments), never
 * the `name(args)` it typed. Scrubbed text is reported, not silently dropped:
 * "why is there no answer" has to be answerable from the timeline.
 */
function describeEchoedCall(echo: EchoedToolCall): string {
  const what = echo.name ? `“${toolActivityPhrase(echo.name)}”` : 'a lookup';
  const detail = humanizeToolInput(echo.args)
    .map((p) => `${p.label}: ${p.value}`)
    .join(' · ');
  return `Wrote ${what}${detail ? ` (${detail})` : ''} as text instead of running it.`;
}

/**
 * An error that says the ENDPOINT could not serve the round — any HTTP failure
 * from the wire (quota 429, 5xx, a model id the gateway refuses) or a network
 * failure / timeout — as opposed to a bug in the turn. Only these may fail a
 * turn over to the next provider in the chain.
 */
export function isEndpointFailure(err: unknown): boolean {
  if (err instanceof GrokWireError) return true;
  if (!(err instanceof Error)) return false;
  return err.name === 'AbortError' || err.name === 'TimeoutError' || (err instanceof TypeError && /fetch failed|network/i.test(err.message));
}

export async function runGrokAssistantTurn(
  args: RunGrokAssistantTurnArgs,
  deps: GrokLoopDeps,
): Promise<RunGrokAssistantTurnResult> {
  /** Anything past the opening `step` has reached the operator — no silent failover after that. */
  let surfaced = false;
  const emit = (event: AssistantEmit) => {
    if (event.type !== 'step') surfaced = true;
    args.emit(event);
  };
  const toSchema = (t: { name: string; description: string; inputSchema: z.ZodTypeAny }) =>
    toOpenAiFunctionTool(t);

  const serverTools = listAssistantTools(args.ctx).map(toSchema);
  const writeMap: WriteToolMap = buildWriteToolMap(args.ctx, args.writeTools);
  const writeTools = [...writeMap.values()].map(toSchema);
  // UI_TOOLS are Anthropic.Tool (description optional, Anthropic's InputSchema
  // shape); narrow them to the wire helper's source type explicitly.
  const uiTools = UI_TOOLS.filter((t) => accessModeAllowsUiTool(args.ctx.accessMode, t.name)).map((t) =>
    toOpenAiFunctionTool({
      name: t.name,
      description: t.description ?? '',
      input_schema: t.input_schema as unknown as Record<string, unknown>,
    }),
  );
  const allTools = [...serverTools, ...writeTools, ...uiTools];
  // A self-hosted runtime prefills the ENTIRE advertisement every round —
  // measured 11.8 s first-token at 54 tools vs 1.2 s at 3 on the same card.
  // Subset to the ~8–10 verbs this turn needs; the registry core (the record finder,
  // the write chokepoint, render_artifact) always rides.
  const subset = deps.selfHosted
    ? subsetAdvertisedTools(args.userMessage, args.context, allTools)
    : null;
  const tools = subset?.tools ?? allTools;
  const advertised = new Set(tools.map((t) => t.function.name));
  /** Every tool this turn COULD name — the scrub's vocabulary, not just the advertised subset. */
  const registeredToolNames = new Set(allTools.map((t) => t.function.name));
  const wireBytes = Buffer.byteLength(JSON.stringify(tools), 'utf8');
  const advertisedToolNames = tools.map((t) => t.function.name);

  // One system message: stable core, then the voice overlay enrichment chose,
  // then the volatile page context. Grok has no cache-breakpoint concept, so
  // the ordering is for the reader, not the cache — but keeping the same order
  // as the Anthropic loop means one prompt to reason about, not two.
  const system = [
    buildSystemCore(advertisedToolNames),
    (args.voiceOverlay ?? '').trim(),
    accessModeFragment(args.ctx.accessMode),
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

  /** The answer: visible text of the round that ended the turn without calls. */
  let answer = '';
  /** Any round has shown the operator text — gates the one Harmony nudge. */
  let spoke = false;
  const toolsUsed: string[] = [];
  /** Connect links this turn's tools actually minted — the pill's provenance. */
  const mintedConnectUrls = new Set<string>();
  const renderAllowed = makeRenderArtifactCap();
  /** What this turn actually showed, inline vs the right rail — the panel-honesty check reads it. */
  const onScreen: TurnShown = { inline: 0, rail: 0 };
  /** Tables a lookup tool carried to the screen this turn — a model-typed copy would duplicate them. */
  let carriedTables = 0;
  /** One "answer the operator" nudge per turn, for a model that only reasons. */
  let nudgedForFinal = false;
  let turns = 0;
  /** Visible answer text of the OPEN round — what a stop keeps. */
  let shown = '';
  /** Token counts summed over the rounds that reported any; `reported` false → usage null. */
  const spent = { promptTokens: 0, completionTokens: 0, reported: false };
  let lastRoundUsage: RoundUsage | null = null;
  let gatewayLogId: string | null = null;
  /** The fields every return carries, read at return time. */
  const tally = () => ({
    turns,
    toolsUsed,
    toolsAdvertised: tools.length,
    advertisedToolNames,
    wireBytes,
    usage: spent.reported ? { promptTokens: spent.promptTokens, completionTokens: spent.completionTokens } : null,
    lastRoundUsage,
    gatewayLogId,
  });
  const stoppedResult = (): RunGrokAssistantTurnResult => ({ ok: true, stopped: true, text: answer || shown.trim(), ...tally() });

  try {
    while (turns < MAX_TURNS) {
      if (args.signal?.aborted) return stoppedResult();
      turns += 1;
      // No separator delta between rounds: the client owns layout, and a
      // tool round's text is narration it files into the thinking history.
      emit({ type: 'step', index: turns });

      // One filter per round between the raw model text and the operator
      // (`@/lib/ai/visible-text`): answer prose → `delta`; Harmony
      // `analysis` and `<think>` → `reasoning`; a tool call the model WROTE
      // as text → held back as an echo, never published.
      const visible = createVisibleTextFilter({ toolNames: registeredToolNames });
      shown = '';
      let reasoned = false;
      const echoes: EchoedToolCall[] = [];
      const publish = (slice: VisibleTextSlice) => {
        if (slice.reasoning) {
          reasoned = true;
          emit({ type: 'reasoning', text: slice.reasoning });
        }
        if (slice.text) {
          // gpt-oss writes identifiers with U+2011 (non-breaking hyphen):
          // "C‑03‑12‑3" reads right but is not the bin an operator can search
          // or scan-match. Answer text carries the ASCII hyphen the data has.
          const text = slice.text.replace(/[\u2010\u2011]/g, '-');
          shown += text;
          emit({ type: 'delta', text });
        }
        echoes.push(...slice.echoes);
      };
      // Once a lookup has put its own data on screen, render_artifact is off
      // the menu: a small model otherwise spends extra rounds re-rendering it.
      const roundTools = onScreen.inline + onScreen.rail > 0 ? tools.filter((t) => t.function.name !== 'render_artifact') : tools;
      const round = await deps.streamTurn(
        { messages, tools: roundTools, stream: true },
        (text) => publish(visible.push(text)),
        (name) => {
          // UI tools only: a server read-tool's start is reported by
          // `tool_start` once its arguments are complete.
          if (UI_TOOL_NAMES.has(name)) emit({ type: 'ui_tool_start', name });
        },
        (text) => {
          reasoned = true;
          emit({ type: 'reasoning', text });
        },
      );
      if (round.usage) {
        spent.promptTokens += round.usage.promptTokens;
        spent.completionTokens += round.usage.completionTokens;
        spent.reported = true;
        lastRoundUsage = round.usage;
      }
      if (round.gatewayLogId) gatewayLogId = round.gatewayLogId;
      // Release whatever the filter held back for a split marker.
      publish(visible.flush());

      // A round is a TOOL round when calls accumulated, whatever finish_reason
      // says — relays have been observed sending "stop" alongside tool_calls.
      let calls = round.toolCalls;
      // Persisted/narrated text is what the operator saw, never the markup.
      let narratedText = shown.trim();
      if (calls.length === 0) {
        // Salvage reads the RAW text: the call lives in a suppressed channel.
        const salvaged = toolCallsFromNarration(round.text, advertised);
        if (salvaged.length > 0) {
          calls = salvaged;
          // The narration WAS the call — never hand it back as prose.
          narratedText = '';
        }
      }
      // A call written as text that nothing turned into a real one never ran.
      // Say so in the thinking history instead of dropping it silently; when
      // the round did call, its tool steps already tell that story.
      if (calls.length === 0 && echoes.length > 0) {
        const lines = echoes.map(describeEchoedCall).join('\n');
        emit({ type: 'reasoning', text: reasoned ? `\n\n${lines}` : lines });
      }
      emit({ type: 'step_end', index: turns, toolRound: calls.length > 0 });

      if (narratedText) spoke = true;
      if (calls.length === 0) {
        // A Harmony round that called nothing and said nothing in the `final`
        // channel spent itself on `analysis` — measured on the promoted
        // adapter, which ends a tool turn deliberating instead of answering.
        // Without this nudge the operator sees an empty bubble. Ask ONCE,
        // then take what comes.
        if (!nudgedForFinal && !spoke && looksLikeHarmony(round.text)) {
          nudgedForFinal = true;
          messages.push({
            role: 'user',
            content:
              'Answer the operator now in the final channel: one short sentence off the tool results above, stating the key facts. Never say where the data is shown.',
          });
          continue;
        }
        answer = narratedText;
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

      if (args.signal?.aborted) return stoppedResult();
      // One connection for every tool in this round (§22 H1). UI tools and
      // writes inside it open nothing of their own on this client.
      const results = await runBatch(async () => {
        const out: Array<{ id: string; content: string }> = [];
        for (const [i, call] of calls.entries()) {
          const id = call.id || `call_${turns}_${i}`;
          const input = parseArguments(call.arguments);
          if (UI_TOOL_NAMES.has(call.name) && !accessModeAllowsUiTool(args.ctx.accessMode, call.name)) {
            out.push({ id, content: `ERROR: ${askOnlyRefusal(call.name)}` });
            continue;
          }
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
              if (parsed.data.kind === 'table' && carriedTables > 0) {
                out.push({
                  id,
                  content: 'Not rendered: the lookup already put its table on screen this turn. Answer in one short sentence instead.',
                });
                continue;
              }
              if (!renderAllowed()) {
                out.push({
                  id,
                  content: `ERROR: render_artifact cap reached (${RENDER_ARTIFACT_CAP_PER_TURN} per turn) — answer in text.`,
                });
                continue;
              }
              emit({ type: 'ui_tool', name: call.name, input: { artifact: parsed.data } });
              onScreen[artifactPlacement(parsed.data.kind)] += 1;
              out.push({ id, content: 'Rendered — the operator sees it.' });
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
              emit({ type: 'ui_tool', name: call.name, input: pill.value });
              out.push({ id, content: 'Connect pill shown in the transcript.' });
              continue;
            }
            emit({ type: 'ui_tool', name: call.name, input });
            out.push({ id, content: "Dispatched to the user's browser." });
            continue;
          }
          emit({ type: 'tool_start', name: call.name, input });
          const result = await dispatchToolCall(call.name, input, args.ctx, writeMap, runTool);
          emit({
            type: 'tool_end',
            name: call.name,
            ok: result.ok,
            result: result.ok ? summarizeToolResult(result.data) : null,
          });
          toolsUsed.push(call.name);
          if (result.ok) collectMintedConnectUrls(result.data, mintedConnectUrls);
          // A device tool (a print) resolved the action server-side; the browser runs it.
          const device = result.ok ? takeDeviceAction(result.data) : null;
          if (device) emit({ type: 'ui_tool', name: device.name, input: device.input });
          // A report tool hands back a validated artifact plus a short summary.
          // The artifact goes straight to the screen and the model is told only
          // that it rendered — see `tool-artifact.ts` for why the model must
          // never be the one to retype a report's numbers.
          const carried = result.ok ? splitToolArtifact(result.data) : null;
          if (carried && renderAllowed()) {
            emit({ type: 'ui_tool', name: 'render_artifact', input: { artifact: carried.artifact, producedBy: carried.tool } });
            onScreen[artifactPlacement(carried.artifact.kind)] += 1;
            if (carried.artifact.kind === 'table') carriedTables += 1;
          }
          out.push({
            id,
            content: result.ok
              ? JSON.stringify(
                  carried
                    ? { ...carried.modelData, note: 'Already on screen for the user. Do not call any tool to show it. Answer now in one short sentence.' }
                    : result.data,
                )
              : `ERROR: ${result.error}`,
          });
        }
        return out;
      });

      for (const r of results) {
        messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
      }
    }

    let text = answer;
    if (turns >= MAX_TURNS && !text) {
      text = 'I ran out of steps while researching that — try a narrower question.';
      // Said to the operator too — it used to reach only the persisted row.
      emit({ type: 'delta', text });
    }
    // Server-side half of PANEL HONESTY: an answer that points at the panel in
    // a turn that opened nothing there gets a one-line correction, streamed
    // and persisted with it (panel-honesty.ts).
    const correction = panelClaimCorrection(text, onScreen);
    if (correction) {
      const tail = `\n\n${correction}`;
      emit({ type: 'delta', text: tail });
      text += tail;
    }
    return { ok: true, text, ...tally() };
  } catch (err) {
    if (args.signal?.aborted) return stoppedResult();
    const message = err instanceof Error ? err.message : 'assistant error';
    if (args.canFailOver && !surfaced && isEndpointFailure(err)) {
      return { ok: false, text: '', error: message, failedOver: true, ...tally() };
    }
    emit({ type: 'error', message, code: isEndpointFailure(err) ? 'provider_unreachable' : 'internal' });
    return { ok: false, text: answer, error: message, ...tally() };
  }
}
