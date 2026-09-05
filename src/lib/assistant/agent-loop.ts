/**
 * Server agent loop (plan §3.2) — the Claude tool-use loop behind
 * POST /api/assistant/chat.
 *
 * Read/explain only in Phase 2: the model composes the org-scoped read-tool
 * registry (src/lib/assistant/tools) plus a CLIENT UI tool namespace
 * (navigate/highlight + Phase 3 canvas stubs). Server tools execute here; UI
 * tool calls are forwarded to the browser through the `emit` sink and
 * acknowledged to the model immediately (standard client-tool pattern).
 *
 * Invariants:
 *   • org/staff/permissions come from the authenticated ctx — NEVER from the
 *     model or the request body;
 *   • hard iteration cap (MAX_TURNS) — a runaway loop degrades to a polite
 *     "ran out of steps", never an unbounded bill;
 *   • tool failures surface to the model as is_error tool_results it can
 *     route around — they never throw out of the loop;
 *   • prompt-cache discipline: stable system core first (cache_control), the
 *     volatile page-context fragment after the breakpoint.
 *
 * Deps-injected (default = real Anthropic SDK + real tool registry) so unit
 * tests run with zero network and zero DB.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { listAssistantTools, runAssistantTool } from '@/lib/assistant/tools';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolDeps } from '@/lib/assistant/tools/types';
import { buildWriteToolMap, dispatchToolCall } from '@/lib/assistant/tools/dispatch';
import type { AssistantPageContext } from './context-store';
import { resolveOrgAnthropicBrain } from '@/lib/ai/org-provider';
import type { OrgId } from '@/lib/tenancy/constants';

/** Fallback model when the connected provider does not name one. */
const ASSISTANT_MODEL = 'claude-opus-4-8';
/** Shared with grok-agent-loop.ts — one cap, whichever brain is speaking. */
export const MAX_TURNS = 8;
const MAX_TOKENS = 16000;

// ─── UI tools (client-executed) ──────────────────────────────────────────────
// navigate/highlight are live in Phase 2; the canvas-control namespace ships
// as stubs the dock ignores until Phase 3 wires the Studio URL state.

export const UI_TOOLS: Anthropic.Tool[] = [
  {
    name: 'navigate',
    description:
      'Navigate the user\'s browser to an app route. Every surface is URL-addressable — e.g. /operations?mode=analytics, /unbox?openReceivingId=123 (the Unbox surface), /triage (receiving scan/identify), /pack (packing station), /test?view=testing (testing/QC station), /pickup (local pickup), /studio?focus=<nodeId>. Use after you have gathered what you need and the user asked to go somewhere or you want to show them the data in place.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute app path starting with /' },
        params: {
          type: 'object',
          description: 'Query params to append, e.g. {"mode":"analytics"}',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'highlight',
    description:
      'Visually highlight an entity on the current page by canonical ref (e.g. "serial_units:entity:9041" or "feed_memberships:feed_key:receiving_triage:entity:123"). Use to point the user at a specific row/card you are talking about.',
    input_schema: {
      type: 'object',
      properties: { ref: { type: 'string', description: 'Canonical ref of the entity to highlight' } },
      required: ['ref'],
    },
  },
  // Canvas-control tools — drive the /studio URL view state in the user's
  // browser (they navigate to /studio if the user isn't there).
  {
    name: 'focus_node',
    description: 'Focus a node on the /studio canvas so the user sees it (drives ?focus= and zooms to the flow level). Use when discussing or editing a specific node.',
    input_schema: {
      type: 'object',
      properties: { nodeId: { type: 'string' } },
      required: ['nodeId'],
    },
  },
  {
    name: 'set_lens',
    description: 'Switch the /studio overlay lens: build (structure), live (occupancy), flow (throughput), people (coverage), gaps (diagnostics), static (flow projection).',
    input_schema: {
      type: 'object',
      properties: { lens: { type: 'string', enum: ['build', 'live', 'flow', 'people', 'gaps', 'static'] } },
      required: ['lens'],
    },
  },
  {
    name: 'set_zoom',
    description: 'Set the /studio semantic-zoom depth: 0 department map, 1 flow graph, 2 station detail.',
    input_schema: {
      type: 'object',
      properties: { z: { type: 'integer', enum: [0, 1, 2] } },
      required: ['z'],
    },
  },
];

const UI_TOOL_NAMES = new Set(UI_TOOLS.map((t) => t.name));

// ─── System prompt ───────────────────────────────────────────────────────────

/** Stable core — byte-identical across requests so the prompt cache holds. */
export function buildSystemCore(toolNames: string[]): string {
  return [
    'You are the operations assistant embedded in a used-electronics reseller operations platform (receiving, testing, repair, listing, fulfillment, returns).',
    'You answer questions about THIS organization\'s live operation using your read tools — never from memory. Compose tools per question: identifiers / find / where / which → hybrid_entity_search or exact_id_serial_search; #ticket → resolve_support_ticket; full history / trace / what happened → get_operations_journey; serial return / which order shipped this serial → lookup_serial; warranty / coverage / expired → lookup_warranty_coverage or list_warranty_claims; specific order id or tracking → get_order_lookup; my tech queue → get_my_tech_queue; assignments → get_assignments; photos → search_photos; receiving by tracking → get_receiving_by_tracking; packing pace / packer KPIs → get_packing_kpi; aggregates / why failing → get_top_reasons / get_kpis / get_signals_by_node; then drill with get_unit_journey, search_notes, get_node_detail.',
    'When the answer depends on operational data not already in the conversation, you MUST call a read tool before answering.',
    'If you have the propose_mutation tool you can make changes. The trust model is automatic — you never decide whether a change is applied: view-layer changes (dismiss a rail item, set a feed item state, record a signal, tune a node surface) apply immediately; workflow DRAFT edits (add/remove/wire/config a node in a draft graph) apply to a draft the user can preview and revert; changes to masters (create staff, add a reason code, change a setting) are queued for review. ALWAYS set the user\'s expectation from the returned status: "applied to your draft", "done", or "queued for review — a human needs to apply it". For draft graph edits, use the canvas-control tools (focus_node/set_lens/set_zoom) to show the user the change, and remind them publishing stays their step (you can request it, you cannot publish).',
    'UI tools (navigate, highlight) run in the user\'s browser: use navigate to take the user to the page that shows what you found (all state is in the URL — prefer the href from SearchHit / resolve_support_ticket), and highlight to point at a specific record. Narrate what you are doing.',
    'Grounding: report numbers exactly as tools return them; if a tool returns empty or fails, say so plainly and continue with what you have. Never invent identifiers.',
    'Style: plain sentences, lead with the answer, keep it short. Use the org\'s vocabulary (cartons, lines, serials, feeds, nodes).',
    `Available tools: ${toolNames.join(', ')}.`,
  ].join('\n\n');
}

/** Volatile per-request context — rendered AFTER the cache breakpoint. */
export function buildContextFragment(context: AssistantPageContext | null | undefined): string {
  if (!context) return 'Page context: none provided.';
  const parts = [
    `Page context: the user is on "${context.page}"`,
    context.station ? `at station ${context.station}` : null,
    context.mode ? `in mode "${context.mode}"` : null,
    context.selection ? `with ${context.selection.kind} ${context.selection.id} selected` : null,
  ].filter(Boolean);
  const skill = context.skill ? `\n\nPage skill:\n${context.skill}` : '';
  return `${parts.join(', ')}.${skill}`;
}

// ─── Loop types ──────────────────────────────────────────────────────────────

export type AssistantEmit =
  | { type: 'delta'; text: string }
  | { type: 'tool_start'; name: string; input: unknown }
  | { type: 'tool_end'; name: string; ok: boolean }
  | { type: 'ui_tool'; name: string; input: unknown }
  | { type: 'error'; message: string };

export interface RunAssistantTurnArgs {
  ctx: AssistantToolCtx;
  /** Prior turns, oldest first (flat text history from ai_chat_messages). */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userMessage: string;
  context?: AssistantPageContext | null;
  /**
   * Per-request write tools (built with the chat sessionId) — filtered by
   * permission before use. Empty for read-only callers. Their .run() is
   * dispatched in-process (not via the read registry).
   */
  writeTools?: ReadonlyArray<AssistantToolDef<z.ZodTypeAny, unknown>>;
  /**
   * Voice overlay chosen by enrichment (carton brief / workspace facts). It
   * rides AFTER the cached core because it varies per turn, and it is passed as
   * text rather than an enum so this module stays free of domain imports. Both
   * loops apply it the same way — the Grok mouth and the Anthropic mouth should
   * not sound like two different assistants on the same page.
   */
  voiceOverlay?: string | null;
  /** Registry deps — the per-round tenant session in production (§22 H1). */
  toolDeps?: AssistantToolDeps;
  /** Wraps each round's tool execution so one round shares one connection. */
  runToolBatch?: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Sink for streaming events to the client (SSE writer). */
  emit: (event: AssistantEmit) => void;
}

export interface RunAssistantTurnResult {
  ok: boolean;
  /** Final assistant text (what gets persisted + rendered). */
  text: string;
  turns: number;
  /** Names of the tools actually executed — the [ask-timing] line reports it. */
  toolsUsed: string[];
  error?: string;
}

export interface AgentLoopDeps {
  /** Streams one model turn; returns the final message. Default = Anthropic SDK. */
  streamTurn: (
    params: {
      system: Anthropic.Messages.TextBlockParam[];
      messages: Anthropic.MessageParam[];
      tools: Anthropic.Tool[];
    },
    onTextDelta: (text: string) => void,
  ) => Promise<Anthropic.Message>;
  runTool: typeof runAssistantTool;
}

/**
 * Build the real deps for ONE org.
 *
 * Resolves the org's own Anthropic key from the vault before the platform's
 * (`resolveOrgAnthropicBrain`). This used to read `process.env.ANTHROPIC_API_KEY`
 * directly, which meant every tenant's assistant ran on a single platform key
 * and a single hardcoded model — the same single-tenant leak `hermes-client`
 * had, in the one surface the Phase 1 sweep did not reach.
 *
 * The model follows the key: an org that brought its own key may also name its
 * own model, and billing someone else's key for a model they did not choose is
 * the kind of surprise that shows up on an invoice.
 */
async function makeDefaultDeps(orgId: OrgId): Promise<AgentLoopDeps> {
  const brain = await resolveOrgAnthropicBrain(orgId);
  if (!brain) {
    throw new Error(
      'No Anthropic provider is connected for this workspace — the assistant is unavailable. ' +
        'Connect one in Settings → AI, or set the platform ANTHROPIC_API_KEY.',
    );
  }
  const client = new Anthropic({ apiKey: brain.apiKey });
  const model = brain.model || ASSISTANT_MODEL;
  return {
    streamTurn: async (params, onTextDelta) => {
      const stream = client.messages.stream({
        model,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system: params.system,
        messages: params.messages,
        tools: params.tools,
      });
      stream.on('text', onTextDelta);
      return stream.finalMessage();
    },
    runTool: runAssistantTool,
  };
}

// ─── The loop ────────────────────────────────────────────────────────────────

export async function runAssistantTurn(
  args: RunAssistantTurnArgs,
  deps: AgentLoopDeps | null = null,
): Promise<RunAssistantTurnResult> {
  const d = deps ?? (await makeDefaultDeps(args.ctx.organizationId as OrgId));

  const toSchema = (t: { name: string; description: string; inputSchema: z.ZodTypeAny }): Anthropic.Tool => ({
    name: t.name,
    description: t.description,
    // Zod 4 native JSON-schema derivation (the MCP-forward payoff of keeping
    // zod schemas in the registry).
    input_schema: {
      ...(z.toJSONSchema(t.inputSchema) as Record<string, unknown>),
      type: 'object',
    } as Anthropic.Tool.InputSchema,
  });

  const serverTools = listAssistantTools(args.ctx).map(toSchema);
  // Write tools filtered by permission; dispatched in-process by name through
  // the shared chokepoint (tools/dispatch.ts) both loops use.
  const writeMap = buildWriteToolMap(args.ctx, args.writeTools);
  const writeTools = [...writeMap.values()].map(toSchema);
  const tools = [...serverTools, ...writeTools, ...UI_TOOLS];

  const overlay = (args.voiceOverlay ?? '').trim();
  const system: Anthropic.Messages.TextBlockParam[] = [
    {
      type: 'text',
      text: buildSystemCore(tools.map((t) => t.name)),
      cache_control: { type: 'ephemeral' },
    },
    ...(overlay ? [{ type: 'text' as const, text: overlay }] : []),
    { type: 'text', text: buildContextFragment(args.context) },
  ];

  // The history window can start mid-conversation on an assistant turn, but
  // the API requires messages[0] to be a user message — trim leading
  // assistant turns (consecutive same-role later in the list is fine).
  const firstUser = args.history.findIndex((m) => m.role === 'user');
  const usableHistory = firstUser === -1 ? [] : args.history.slice(firstUser);
  const messages: Anthropic.MessageParam[] = [
    ...usableHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: args.userMessage },
  ];

  const runBatch = args.runToolBatch ?? (<T,>(fn: () => Promise<T>) => fn());
  const runTool: typeof runAssistantTool = args.toolDeps
    ? (name, input, ctx, toolDeps) => d.runTool(name, input, ctx, toolDeps ?? args.toolDeps)
    : d.runTool;

  const turnTexts: string[] = [];
  const toolsUsed: string[] = [];
  let turns = 0;

  try {
    while (turns < MAX_TURNS) {
      turns += 1;
      // Separator between turns so streamed narration and persisted text agree
      // ("…checking now" + "Based on…" must not fuse).
      if (turnTexts.length > 0) args.emit({ type: 'delta', text: '\n\n' });
      const message = await d.streamTurn({ system, messages, tools }, (text) => {
        args.emit({ type: 'delta', text });
      });

      const textParts = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text);
      if (textParts.length > 0) turnTexts.push(textParts.join('\n'));

      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content });
        continue;
      }

      const toolUses = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      if (message.stop_reason !== 'tool_use' || toolUses.length === 0) break;

      messages.push({ role: 'assistant', content: message.content });

      // Execute ALL tool calls, return ALL results in ONE user message — on
      // one tenant connection for the whole round (§22 H1).
      const results = await runBatch(async () => {
        const out: Anthropic.ToolResultBlockParam[] = [];
        for (const call of toolUses) {
          if (UI_TOOL_NAMES.has(call.name)) {
            // Client tool: forward to the browser, acknowledge to the model.
            args.emit({ type: 'ui_tool', name: call.name, input: call.input });
            out.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: 'Dispatched to the user\'s browser.',
            });
            continue;
          }
          args.emit({ type: 'tool_start', name: call.name, input: call.input });
          const result = await dispatchToolCall(call.name, call.input, args.ctx, writeMap, runTool);
          args.emit({ type: 'tool_end', name: call.name, ok: result.ok });
          toolsUsed.push(call.name);
          out.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: result.ok ? JSON.stringify(result.data) : result.error,
            is_error: !result.ok || undefined,
          });
        }
        return out;
      });
      messages.push({ role: 'user', content: results });
    }

    let finalText = turnTexts.join('\n\n');
    if (turns >= MAX_TURNS && !finalText) {
      finalText = 'I ran out of steps while researching that — try a narrower question.';
    }
    return { ok: true, text: finalText, turns, toolsUsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'assistant error';
    args.emit({ type: 'error', message });
    return { ok: false, text: turnTexts.join('\n\n'), turns, toolsUsed, error: message };
  }
}
