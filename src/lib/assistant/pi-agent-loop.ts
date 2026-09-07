/**
 * ONE agent loop, every wire — the pi-ai unified tool loop.
 *
 * ## Why this file exists
 *
 * We shipped two loops for the same conversation. `agent-loop.ts` speaks the
 * Anthropic Messages API through `@anthropic-ai/sdk`; `grok-agent-loop.ts`
 * speaks the OpenAI Chat-Completions wire through raw `fetch`. They are the
 * same loop twice: build the advertisement, stream a round, salvage the text,
 * accumulate tool calls, dispatch through `tools/dispatch.ts`, echo results,
 * repeat under a turn cap. Every behavioural fix has had to be written twice,
 * and the two mouths drift (history was handed to the Anthropic loop for weeks
 * before the Grok branch got it — see the comment at grok-agent-loop.ts:609).
 *
 * `@earendil-works/pi-ai` removes the duplication at the root: it normalizes
 * ten provider APIs onto ONE `Context` → `AssistantMessageEventStream`
 * protocol. **This loop is provider-agnostic because pi-ai picks the wire
 * adapter from the model's `api` field** (`Model<Api>.api`, types.d.ts:716 —
 * `"anthropic-messages"`, `"openai-completions"`, `"google-generative-ai"`, …).
 * The loop below never names a provider, never builds a request body and never
 * parses an SSE frame. Point it at a `Model<'anthropic-messages'>` and it is
 * the Anthropic loop; point it at a `Model<'openai-completions'>` and it is the
 * Grok/Ollama/MLX loop. So `agent-loop.ts` and `grok-agent-loop.ts` become one.
 *
 * ## What it keeps
 *
 * Everything the two loops actually promised:
 *   • org / staff / permissions come from the authenticated `ctx` — a
 *     model-supplied `organizationId` in the arguments is just an argument the
 *     Zod schema accepts or rejects, never authority;
 *   • every server tool goes through `dispatchToolCall` and nothing else;
 *   • UI tools never reach dispatch — they are forwarded to the browser and
 *     acknowledged to the model in the same round;
 *   • `render_artifact` is validated HERE, so a malformed payload comes back as
 *     an `isError` tool result the model repairs in-turn;
 *   • `request_connection` may only carry a link a tool minted in THIS turn;
 *   • report tools keep their exact bytes: the artifact goes to the panel, only
 *     the summary reaches the model (`tool-artifact.ts`);
 *   • one hard turn cap (`MAX_PI_TURNS`), and nothing throws out of the loop.
 *
 * One deliberate difference from the spec sketch: the early "the model opened a
 * tool block" signal is emitted ONLY as `ui_tool_start`, never as an early
 * `tool_start`. `AssistantEmit.tool_start` carries `input`, and the SSE route +
 * the client's tool-activity rail pair one `tool_start` with one `tool_end`; a
 * second, input-less `tool_start` at block-open would double every row. Server
 * tools therefore report `tool_start` at dispatch with the complete input,
 * exactly as both existing loops do, and UI tools get the early skeleton paint
 * that made `ui_tool_start` exist in the first place.
 *
 * ## Cutover — NOT wired yet
 *
 * `POST /api/assistant/chat` still routes through `chooseAssistantMouth`. The
 * exact single change that flips this on: make that switch's `wire-tools` AND
 * `anthropic-tools` branches both call `runPiAssistantTurn(args, await
 * makePiLoopDeps(orgId, 'assistant'))` instead of `runGrokAssistantTurn` /
 * `runAssistantTurn` — one branch merge, no other edit. It is left un-wired
 * because three measured behaviours have no live endpoint on this machine to
 * re-verify against, and each one is a silent regression if it is wrong:
 *
 *   1. **Harmony channel salvage** (`src/lib/ai/harmony.ts`) for `gpt-oss` on
 *      MLX. pi-ai has ZERO Harmony support — a case-insensitive grep over the
 *      whole installed package (`node_modules/@earendil-works/pi-ai`) returns
 *      no matches. So a Harmony round's private `analysis` channel would stream
 *      straight to the operator, and a tool call narrated inside a suppressed
 *      channel (`toolCallsFromNarration`) would be lost. Porting the filter is
 *      mechanical; proving it still splits the channels is not.
 *   2. **The buffered-round fallback on a 4xx mid-stream**
 *      (`grokPrefersBufferedRound` / `markGrokBufferedFallback`): relays that
 *      break when tools are streamed. pi-ai streams unconditionally.
 *   3. **Prompt-cache prefix stability**: the Anthropic loop pins
 *      `cache_control` on the stable system core and keeps the volatile page
 *      fragment after the breakpoint. pi-ai takes a single `systemPrompt`
 *      string, so cache-hit rate must be re-measured before this becomes the
 *      only path.
 *
 * Until then this loop lives alongside them and is exercised by
 * `pi-agent-loop.test.ts` against pi-ai's own `fauxProvider` — no network, no
 * DB, no credentials.
 *
 * ## Tenancy
 *
 * pi-ai ships a `CredentialStore` (`~/.pi`, `auth.json`). It is NOT used and
 * MUST NOT be: the org vault (`resolveOrgAiChain`, reached through
 * `orgModels`) stays the sole source of `{ baseURL, apiKey, model, headers }`.
 */

import type {
  Api,
  AssistantMessage,
  Context,
  Message,
  Model,
  Models,
  Tool,
  ToolCall,
  ToolResultMessage,
  Usage,
} from '@earendil-works/pi-ai';
import type { z } from 'zod';
import {
  UI_TOOLS,
  buildContextFragment,
  buildSystemCore,
  collectMintedConnectUrls,
  parseRenderArtifactInput,
  parseRequestConnectionInput,
  type AssistantEmit,
} from './agent-loop';
import { splitToolArtifact } from './tool-artifact';
import { subsetAdvertisedTools } from './tool-subsetting';
import { listAssistantTools, runAssistantTool } from '@/lib/assistant/tools';
import {
  toOpenAiFunctionTool,
  type OpenAiFunctionTool,
  type WireToolSource,
} from '@/lib/assistant/tools/openai-schema';
import {
  buildWriteToolMap,
  dispatchToolCall,
  type RunAssistantToolFn,
  type WriteToolMap,
} from '@/lib/assistant/tools/dispatch';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolDeps } from '@/lib/assistant/tools/types';
import type { AssistantPageContext } from './context-store';
import type { AiCapability } from '@/lib/ai/provider';
import type { OrgId } from '@/lib/tenancy/constants';

/** One cap, whichever brain is speaking — same value as `MAX_TURNS`. */
export const MAX_PI_TURNS = 8;

/** UI verbs run in the browser; they never reach `dispatchToolCall`. */
const UI_TOOL_NAMES = new Set(UI_TOOLS.map((t) => t.name));

const RAN_OUT = 'I ran out of steps while researching that — try a narrower question.';

// ─── Tool advertisement ──────────────────────────────────────────────────────

/**
 * Registry (Zod) + UI (hand-written JSON Schema) tools → pi-ai `Tool[]`.
 *
 * pi-ai types `Tool.parameters` as a typebox `TSchema` (types.d.ts:383-387),
 * which sounds like it demands typebox builders. It does not:
 * `TSchema` is declared `export interface TSchema {}` — an EMPTY interface —
 * at `node_modules/typebox/build/type/types/schema.d.mts:1-2`. Every non-null
 * object is structurally assignable to it, and a typebox schema's runtime
 * representation IS a plain JSON-Schema object (that is why every adapter can
 * spread it into a request body, e.g. `...parameters` at
 * `dist/api/anthropic-messages.js:1122`). So the JSON Schema the repo already
 * derives with `z.toJSONSchema` (`tools/openai-schema.ts`) is passed straight
 * through — no `Type.Unsafe` wrapper, no third schema dialect in the registry,
 * and identical bytes to what the OpenAI-wire loop advertises today.
 *
 * `toOpenAiFunctionTool` is reused rather than re-deriving because it already
 * strips `$schema` and pins `type: 'object'`, and because `subsetAdvertisedTools`
 * scores `OpenAiFunctionTool` — one shape, one ranking, both loops.
 */
export function piToolsFromRegistry(
  sources: ReadonlyArray<WireToolSource>,
  options: {
    /** Self-hosted runtimes prefill the whole advertisement every round. */
    selfHosted?: boolean;
    userMessage?: string;
    context?: AssistantPageContext | null;
  } = {},
): Tool[] {
  const wire: OpenAiFunctionTool[] = sources.map((s) => toOpenAiFunctionTool(s));
  // Measured on the 16 GB card: 11.8 s first-token at 54 tools vs 1.2 s at 3.
  // The registry core (finders, the write chokepoint, render_artifact) always
  // rides; see tool-subsetting.ts.
  const advertised = options.selfHosted
    ? subsetAdvertisedTools(options.userMessage ?? '', options.context ?? null, wire).tools
    : wire;
  return advertised.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters as Tool['parameters'],
  }));
}

// ─── Loop types ──────────────────────────────────────────────────────────────

export interface RunPiAssistantTurnArgs {
  ctx: AssistantToolCtx;
  /** Prior turns, oldest first (flat text history from ai_chat_messages). */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userMessage: string;
  context?: AssistantPageContext | null;
  /**
   * Voice overlay chosen by enrichment. Rides AFTER the stable core because it
   * varies per turn — same ordering as both existing loops, so there is one
   * prompt to reason about and not three.
   */
  voiceOverlay?: string | null;
  /** Per-request write tools, filtered by permission before advertisement. */
  writeTools?: ReadonlyArray<AssistantToolDef<z.ZodTypeAny, unknown>>;
  /** Registry deps — the per-round tenant session in production (§22 H1). */
  toolDeps?: AssistantToolDeps;
  /** Wraps each round's tool execution so one round shares one connection. */
  runToolBatch?: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Sink for streaming events to the client (SSE writer). */
  emit: (event: AssistantEmit) => void;
}

export interface RunPiAssistantTurnResult {
  ok: boolean;
  text: string;
  turns: number;
  toolsUsed: string[];
  toolsAdvertised: number;
  error?: string;
}

export interface PiLoopDeps {
  /** Resolved collection — auth applied, provider registered (`orgModels`). */
  models: Models;
  /** The model to speak with. Its `api` field alone chooses the wire. */
  model: Model<Api>;
  /** Read-registry chokepoint. Default = the real registry. */
  runTool?: RunAssistantToolFn;
  /** Drives tool-advertisement subsetting, same as the wire loop. */
  selfHosted?: boolean;
}

export interface MakePiLoopDepsOptions {
  selfHosted?: boolean;
  /** Prefer this vault source (`'ollama' | 'grok' | … | 'platform'`). */
  source?: string;
  runTool?: RunAssistantToolFn;
}

/**
 * Real deps for ONE org: the vault chain resolved into a pi-ai `Models` plus
 * the chosen model. Nothing here reads a pi-ai credential store — the chain
 * comes from `resolveOrgAiChain` through `orgModels`.
 *
 * This is the whole production wiring the cutover needs; see the module
 * docblock for the one branch that must call it.
 */
export async function makePiLoopDeps(
  orgId: OrgId,
  capability: AiCapability,
  options: MakePiLoopDepsOptions = {},
): Promise<PiLoopDeps> {
  // Dynamic on purpose: `pi-provider` imports pi-ai's RUNTIME exports, and
  // pi-ai publishes only the `import` export condition. A static import here
  // would drag the ESM-only package into every consumer of this module —
  // including the CJS test runner, which cannot resolve it, and which has no
  // business loading a credential-resolving module to test a loop that takes
  // its `Models` by injection. The loop core imports pi-ai for TYPES only.
  const { orgModels } = await import('@/lib/ai/pi-provider');
  const resolved = await orgModels(orgId, capability);
  const picked = resolved.pick(options.source);
  if (!picked) {
    throw new Error(
      'No AI provider is connected for this workspace — the assistant is unavailable. ' +
        'Connect one in Settings → AI.',
    );
  }
  return {
    models: resolved.models,
    model: picked.model,
    ...(options.runTool ? { runTool: options.runTool } : {}),
    ...(options.selfHosted === undefined ? {} : { selfHosted: options.selfHosted }),
  };
}

// ─── Message helpers ─────────────────────────────────────────────────────────

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/**
 * A persisted history turn → a pi-ai `AssistantMessage`. The provenance fields
 * (`api`/`provider`/`model`) describe the model we are about to speak with,
 * not the one that produced the text: history is flat text out of
 * `ai_chat_messages` and the original response metadata was never stored. The
 * adapters use these only to decide how to REPLAY the message on the wire, so
 * describing the current model is the correct answer, not a lie of convenience.
 */
function historyAssistant(text: string, model: Model<Api>, timestamp: number): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: ZERO_USAGE,
    stopReason: 'stop',
    timestamp,
  };
}

function toolResult(
  call: { id: string; name: string },
  text: string,
  isError: boolean,
): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId: call.id,
    toolName: call.name,
    content: [{ type: 'text', text }],
    isError,
    timestamp: Date.now(),
  };
}

// ─── The loop ────────────────────────────────────────────────────────────────

export async function runPiAssistantTurn(
  args: RunPiAssistantTurnArgs,
  deps: PiLoopDeps,
): Promise<RunPiAssistantTurnResult> {
  const writeMap: WriteToolMap = buildWriteToolMap(args.ctx, args.writeTools);
  const sources: WireToolSource[] = [
    ...listAssistantTools(args.ctx),
    ...writeMap.values(),
    // UI tools carry a hand-written JSON `input_schema`; `description` is
    // optional on Anthropic.Tool, required on the wire source.
    ...UI_TOOLS.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      input_schema: t.input_schema as unknown as Record<string, unknown>,
    })),
  ];
  const tools = piToolsFromRegistry(sources, {
    ...(deps.selfHosted === undefined ? {} : { selfHosted: deps.selfHosted }),
    userMessage: args.userMessage,
    context: args.context ?? null,
  });

  const overlay = (args.voiceOverlay ?? '').trim();
  const systemPrompt = [
    buildSystemCore(tools.map((t) => t.name)),
    overlay,
    buildContextFragment(args.context),
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');

  // A history window can start mid-conversation on an assistant turn, but
  // several adapters require the first message to be a user message — trim
  // leading assistant turns (consecutive same-role later in the list is fine).
  const firstUser = args.history.findIndex((m) => m.role === 'user');
  const usableHistory = firstUser === -1 ? [] : args.history.slice(firstUser);
  const now = Date.now();
  const messages: Message[] = [
    ...usableHistory.map((m, i) =>
      m.role === 'user'
        ? ({ role: 'user', content: m.content, timestamp: now - usableHistory.length + i } as const)
        : historyAssistant(m.content, deps.model, now - usableHistory.length + i),
    ),
    { role: 'user', content: args.userMessage, timestamp: now },
  ];

  const runBatch = args.runToolBatch ?? (<T,>(fn: () => Promise<T>) => fn());
  const baseRunTool: RunAssistantToolFn = deps.runTool ?? runAssistantTool;
  const runTool: RunAssistantToolFn = args.toolDeps
    ? (name, input, ctx, toolDeps) => baseRunTool(name, input, ctx, toolDeps ?? args.toolDeps)
    : baseRunTool;

  const turnTexts: string[] = [];
  const toolsUsed: string[] = [];
  /** Connect links this turn's tools actually minted — the pill's provenance. */
  const mintedConnectUrls = new Set<string>();
  let turns = 0;

  const fail = (message: string): RunPiAssistantTurnResult => {
    args.emit({ type: 'error', message });
    return {
      ok: false,
      text: turnTexts.join('\n\n'),
      turns,
      toolsUsed,
      toolsAdvertised: tools.length,
      error: message,
    };
  };

  try {
    while (turns < MAX_PI_TURNS) {
      turns += 1;
      // Separator between turns so streamed narration and persisted text agree
      // ("…checking now" + "Based on…" must not fuse).
      if (turnTexts.length > 0) args.emit({ type: 'delta', text: '\n\n' });

      const context: Context = { systemPrompt, messages, tools };
      const roundText: string[] = [];
      const calls: ToolCall[] = [];
      /** Content indices whose tool NAME has already been announced. */
      const announced = new Set<number>();
      /** The `done` message — the assistant turn to replay in the next round. */
      let finished: AssistantMessage | null = null;

      const announce = (contentIndex: number, name: string | undefined): void => {
        if (announced.has(contentIndex) || !name) return;
        announced.add(contentIndex);
        // UI tools only: a server tool's start is reported by `tool_start` once
        // its input is complete, so one row is one dispatch.
        if (UI_TOOL_NAMES.has(name)) args.emit({ type: 'ui_tool_start', name });
      };

      for await (const event of deps.models.stream(deps.model, context)) {
        switch (event.type) {
          case 'text_delta':
            args.emit({ type: 'delta', text: event.delta });
            break;
          case 'text_end':
            if (event.content) roundText.push(event.content);
            break;
          // The name is not on the wire at block-open for every adapter, so
          // watch the shared `partial` until it carries one.
          case 'toolcall_start':
          case 'toolcall_delta': {
            const block = event.partial.content[event.contentIndex];
            announce(event.contentIndex, block?.type === 'toolCall' ? block.name : undefined);
            break;
          }
          case 'toolcall_end':
            announce(event.contentIndex, event.toolCall.name);
            calls.push(event.toolCall);
            break;
          case 'error':
            return fail(event.error.errorMessage || 'assistant error');
          case 'done':
            finished = event.message;
            break;
          default:
            // start / thinking_* — thinking is the model's own channel and is
            // never shown to the operator.
            break;
        }
      }

      if (roundText.length > 0) turnTexts.push(roundText.join('\n'));
      if (!finished) return fail('assistant stream ended without a result');

      // A round is a TOOL round when calls accumulated, whatever `done.reason`
      // says — relays have been observed reporting `stop` alongside tool calls,
      // and pi-ai passes the provider's own reason through faithfully.
      if (calls.length === 0) break;

      messages.push(finished);

      // Execute ALL tool calls, echo ALL results — on one tenant connection
      // for the whole round (§22 H1).
      const results = await runBatch(async () => {
        const out: ToolResultMessage[] = [];
        for (const call of calls) {
          if (UI_TOOL_NAMES.has(call.name)) {
            // render_artifact is validated HERE, at the chokepoint: a malformed
            // payload returns as an isError tool result the model repairs
            // in-turn, so the browser never renders a guess and the model never
            // believes a broken artifact landed.
            if (call.name === 'render_artifact') {
              const parsed = parseRenderArtifactInput(call.arguments);
              if (!parsed.success) {
                out.push(
                  toolResult(
                    call,
                    `render_artifact rejected: ${parsed.error.issues
                      .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
                      .join('; ')}. Fix the payload (plain strings/numbers only) and re-emit, or answer in text.`,
                    true,
                  ),
                );
                continue;
              }
              args.emit({ type: 'ui_tool', name: call.name, input: { artifact: parsed.data } });
              out.push(toolResult(call, 'Rendered on the session view panel.', false));
              continue;
            }
            // Provenance check, not a scheme check: the pill may only carry a
            // link a connect tool returned in THIS turn.
            if (call.name === 'request_connection') {
              const pill = parseRequestConnectionInput(call.arguments, mintedConnectUrls);
              if (!pill.ok) {
                out.push(toolResult(call, `request_connection rejected: ${pill.error}`, true));
                continue;
              }
              args.emit({ type: 'ui_tool', name: call.name, input: pill.value });
              out.push(toolResult(call, 'Connect pill shown in the transcript.', false));
              continue;
            }
            args.emit({ type: 'ui_tool', name: call.name, input: call.arguments });
            out.push(toolResult(call, "Dispatched to the user's browser.", false));
            continue;
          }

          args.emit({ type: 'tool_start', name: call.name, input: call.arguments });
          const result = await dispatchToolCall(call.name, call.arguments, args.ctx, writeMap, runTool);
          args.emit({ type: 'tool_end', name: call.name, ok: result.ok });
          toolsUsed.push(call.name);
          if (result.ok) collectMintedConnectUrls(result.data, mintedConnectUrls);
          // A report tool hands back a validated artifact plus a short summary.
          // The artifact goes straight to the panel and the model is told only
          // that it rendered — `tool-artifact.ts` explains why the model must
          // never be the one to retype a report's numbers.
          const carried = result.ok ? splitToolArtifact(result.data) : null;
          if (carried) {
            args.emit({ type: 'ui_tool', name: 'render_artifact', input: { artifact: carried.artifact } });
          }
          out.push(
            toolResult(
              call,
              result.ok ? JSON.stringify(carried ? carried.modelData : result.data) : result.error,
              !result.ok,
            ),
          );
        }
        return out;
      });
      messages.push(...results);
    }

    let text = turnTexts.join('\n\n');
    if (turns >= MAX_PI_TURNS && !text) text = RAN_OUT;
    return { ok: true, text, turns, toolsUsed, toolsAdvertised: tools.length };
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'assistant error');
  }
}
