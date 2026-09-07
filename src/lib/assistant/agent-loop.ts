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
import { sessionArtifactSchema, sanitizeSessionArtifact } from './ui-artifacts';
import { listAssistantTools, runAssistantTool } from '@/lib/assistant/tools';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolDeps } from '@/lib/assistant/tools/types';
import { buildWriteToolMap, dispatchToolCall } from '@/lib/assistant/tools/dispatch';
import { splitToolArtifact } from '@/lib/assistant/tool-artifact';
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
  {
    name: 'render_artifact',
    description:
      'MANDATORY for data answers: whenever the user asks to SEE data — a list, table, timeline, ticket history, chart, or record — call this tool with that data INSTEAD of writing rows as text or a markdown table. The artifact renders on the view panel beside the chat. Source every value from a read-tool result you already ran; never invent identifiers or numbers. Kinds: table, timeline, ticket_thread, ticket_reply_draft (a reply you drafted — the USER sends it with Enter, you cannot send), chart (bar/line/donut aggregates), record (a link card for one entity), import_triage (a pasted-CSV order-import triage from triage_orders_csv — the user imports the accepted rows from the panel). For tables: every row object MUST be keyed by the exact column names you declare. After the tool returns "Rendered", write 1–3 sentences pointing at the panel — do not repeat the data in text. Every field is a plain string/number/boolean — no nested objects in table cells.',
    input_schema: {
      type: 'object',
      properties: {
        artifact: {
          type: 'object',
          description:
            'The artifact payload. Discriminated on "kind": table | timeline | ticket_thread | ticket_reply_draft | chart | record.',
        },
      },
      required: ['artifact'],
    },
  },
  {
    // Device tool — client-executed. The chat loop acknowledges immediately;
    // the browser runs it through the desktop bridge (silent print / WebUSB).
    name: 'print_handling_unit_labels',
    description:
      'Print tote/handling-unit license-plate labels (2×1" DataMatrix stickers) on the workstation\'s paired label printer. Pass handlingUnitIds for EXISTING handling units (from a read tool). Printing is a physical action the user asked for by name — say what you are printing before you call. Creating NEW totes is not printable this way; tell the user to create them first.',
    input_schema: {
      type: 'object',
      properties: {
        handlingUnitIds: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Handling-unit ids to print, 1–10 labels per call.',
          minItems: 1,
          maxItems: 10,
        },
      },
      required: ['handlingUnitIds'],
    },
  },
  {
    // In-chat OAuth handoff. The pill renders in the TRANSCRIPT, not on the
    // artifact panel: an authorization prompt is an interaction, not data, and
    // the operator must be able to act on it without leaving the sentence that
    // caused it. The URL is always a link the SERVER minted (Composio Connect
    // Link) — the model never constructs an OAuth URL, and no credential ever
    // travels through chat text.
    name: 'request_connection',
    description:
      'Show the user an inline "Connect <app>" pill with a button, when a tool you called returned status "needs_connection". Pass through the app, appLabel and connectUrl EXACTLY as that tool returned them — never edit, shorten, or invent a connect URL, and never paste the URL as text in your reply. Say one short sentence about what you were trying to do; the pill carries the button, and the app tells you when the connection lands so you can retry the tool.',
    input_schema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Toolkit slug from the tool result, e.g. googledocs' },
        appLabel: { type: 'string', description: 'Operator-facing app name, e.g. Google Docs' },
        connectUrl: { type: 'string', description: 'The connect URL exactly as the tool returned it' },
        reason: {
          type: 'string',
          description: 'One sentence naming what connecting unlocks, e.g. "so I can read your ops handbook"',
        },
      },
      required: ['app', 'appLabel', 'connectUrl'],
    },
  },
];

const UI_TOOL_NAMES = new Set(UI_TOOLS.map((t) => t.name));

/**
 * Validate a `render_artifact` call's input at the chokepoint.
 *
 * The tool DECLARES `{ artifact }`, and the client reads `input.artifact` —
 * but the loops used to hand the wrapper straight to `sessionArtifactSchema`,
 * which parses the artifact itself. The declared payload therefore never
 * validated, and a flattened one validated but reached the browser without the
 * key the client reads: the panel could not render either way. The artifact is
 * now accepted at either depth and normalized back to the declared shape.
 *
 * Before validating, the payload runs through the boundary sanitizer
 * (ui-artifacts.ts): object cells coerce to plain strings, stringy numbers and
 * booleans coerce to their types. The contract stays strict at the client; the
 * boundary absorbs the model's formatting sloppiness instead of spending a
 * repair round — or worse, the user seeing a rejection notice — on it.
 */
export function parseRenderArtifactInput(input: unknown) {
  const raw =
    input !== null && typeof input === 'object' && 'artifact' in input ? input.artifact : input;
  return sessionArtifactSchema.safeParse(sanitizeSessionArtifact(raw));
}

/**
 * Connect URLs the SERVER minted during this turn.
 *
 * `request_connection` used to pass the model's `connectUrl` straight to the
 * browser, where the only check was `startsWith('https://')` — so any https
 * host the model could be talked into emitting became a trusted "Connect
 * Google Docs" button in the operator's own transcript. The agent reads
 * third-party text (ticket notes, receiving notes, Google Docs bodies), which
 * makes that a one-hop phishing primitive: injected text names a link, the
 * pill lends it the app's chrome, the staffer authorizes an attacker.
 *
 * The fix is not a host allowlist (Composio's link host is theirs to change)
 * but provenance: the pill may only carry a URL a Composio tool returned in
 * THIS turn. Collected from tool results, checked at the chokepoint.
 */
export function collectMintedConnectUrls(result: unknown, into: Set<string>): void {
  const walk = (node: unknown, depth: number): void => {
    if (depth > 6 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 50)) walk(item, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'connectUrl' && typeof value === 'string' && value.startsWith('https://')) {
        into.add(value);
      } else if (value !== null && typeof value === 'object') {
        walk(value, depth + 1);
      }
    }
  };
  walk(result, 0);
}

export interface ConnectionPillInput {
  app: string;
  appLabel: string;
  connectUrl: string;
  reason?: string;
}

/**
 * Validate a `request_connection` call. Both loops run this before the pill
 * reaches the browser; a rejection comes back as an error tool result the
 * model can repair by passing the link through verbatim.
 */
export function parseRequestConnectionInput(
  input: unknown,
  minted: ReadonlySet<string>,
): { ok: true; value: ConnectionPillInput } | { ok: false; error: string } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const app = typeof raw.app === 'string' ? raw.app.trim() : '';
  const connectUrl = typeof raw.connectUrl === 'string' ? raw.connectUrl.trim() : '';
  if (app.length === 0 || app.length > 40) {
    return { ok: false, error: 'app must be the toolkit slug the tool returned' };
  }
  if (!minted.has(connectUrl)) {
    return {
      ok: false,
      error:
        'connectUrl must be a link a connect tool returned in this turn, copied exactly. Call connect_app (or re-read the needs_connection result) and pass its connectUrl through unchanged — never edit, shorten or compose one.',
    };
  }
  const appLabel = typeof raw.appLabel === 'string' && raw.appLabel.trim() ? raw.appLabel.trim() : app;
  const reason = typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim().slice(0, 300) : undefined;
  return {
    ok: true,
    value: { app, appLabel: appLabel.slice(0, 60), connectUrl, ...(reason ? { reason } : {}) },
  };
}

// ─── System prompt ───────────────────────────────────────────────────────────

/** Stable core — byte-identical across requests so the prompt cache holds. */
export function buildSystemCore(toolNames: string[]): string {
  return [
    'You are the operations assistant embedded in a used-electronics reseller operations platform (receiving, testing, repair, listing, fulfillment, returns).',
    'You answer questions about THIS organization\'s live operation using your read tools — never from memory. Compose tools per question: identifiers / find / where / which → hybrid_entity_search or exact_id_serial_search; #ticket → resolve_support_ticket; full history / trace / what happened → get_operations_journey; serial return / which order shipped this serial → lookup_serial; warranty / coverage / expired → lookup_warranty_coverage or list_warranty_claims; specific order id or tracking → get_order_lookup; my tech queue → get_my_tech_queue; assignments → get_assignments; photos → search_photos; receiving by tracking → get_receiving_by_tracking; packing pace / packer KPIs → get_packing_kpi; aggregates / why failing → get_top_reasons / get_kpis / get_signals_by_node; today\'s daily checklist / who has run their checks → get_daily_checks; what should I do next / my assigned work / my interrupts → get_my_day; project or plan tasks (ops plans) → get_project_tasks; then drill with get_unit_journey, search_notes, get_node_detail.',
    'When the answer depends on operational data not already in the conversation, you MUST call a read tool before answering.',
    'If you have the propose_mutation tool you can make changes. The trust model is automatic — you never decide whether a change is applied: view-layer changes (dismiss a rail item, set a feed item state, record a signal, tune a node surface) apply immediately; workflow DRAFT edits (add/remove/wire/config a node in a draft graph) apply to a draft the user can preview and revert; changes to masters (create staff, add a reason code, change a setting) are queued for review. ALWAYS set the user\'s expectation from the returned status: "applied to your draft", "done", or "queued for review — a human needs to apply it". For draft graph edits, use the canvas-control tools (focus_node/set_lens/set_zoom) to show the user the change, and remind them publishing stays their step (you can request it, you cannot publish).',
    'UI tools (navigate, highlight) run in the user\'s browser. The view panel beside the chat (the home surface) is where data LANDS: for ANY data the user asks to see (rows, a journey, a ticket conversation, aggregates, a record), you MUST call render_artifact with that data — even if you already ran the read tool. Keep the chat text to 1–3 sentences pointing at the panel; NEVER answer a data question with only a markdown table in text, and NEVER navigate the user to another page to show an answer. Navigate only when the user explicitly asks to go somewhere ("open the shipping desk"). The panel is read-only — if the user wants a change, that is propose_mutation or a drafted reply they send themselves.',
    'Chat text is PROSE in markdown (sentences, short lists, bold). NEVER put a markdown table, chart, or ASCII graphic in chat text — data displays exclusively through render_artifact on the panel. Any table you write in chat is stripped from the reply and moved to the panel anyway, so write it as an artifact from the start.',
    'ORDER IMPORT TRIAGE: when the operator pastes CSV rows of pending orders (or asks to import orders), call triage_orders_csv with the raw pasted text. It returns the header mapping and every row classified — accepted, needs_resolution (with the exact missing fields), or rejected. Render it as an import_triage artifact. For rows needing an item number that carry a title or SKU, call resolve_item_number per row and re-render the triage with the resolved numbers; never invent one. The user imports the accepted rows from the panel — importing is their action, never yours.',
    'OPERATOR REPORTS — five questions have a purpose-built report tool, and for these you MUST use it instead of composing raw reads: "what is <name>\'s packing performance" / "how many boxes did <name> pack" / "packer efficiency" / "wait minutes" → get_packing_performance. "how many boxes are left to be unboxed" / "what is waiting at receiving" → get_unbox_backlog. "what is the most expensive order currently in the warehouse" / "biggest order we are holding" → get_order_value_rank. "what are the highest ROIs" / "where are we leaking" / "what should we fix first" → get_roi_rank. "which staff can I delegate to" / "who should attack the highest ROIs" / "who is free" → get_delegation_plan. A report tool RENDERS ITS OWN PANEL: it returns { rendered: true, summary } and the report is already on screen, so do NOT call render_artifact after one and do NOT restate its tables in chat. Say the headline in one or two sentences and name the one thing you would do next. If the operator names a staff member, pass the name through — never guess which person they meant.',
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
  /**
   * The model OPENED a UI tool block — name only, the input is still
   * streaming. The client paints the placeholder on this, so the artifact
   * plane stops arriving a whole message late.
   */
  | { type: 'ui_tool_start'; name: string }
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
    /**
     * Fired the moment the model OPENS a tool block, before its input has
     * finished streaming. Optional: scripted deps may implement two params.
     */
    onToolStart?: (name: string) => void,
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
    streamTurn: async (params, onTextDelta, onToolStart) => {
      const stream = client.messages.stream({
        model,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system: params.system,
        messages: params.messages,
        tools: params.tools,
      });
      stream.on('text', onTextDelta);
      if (onToolStart) {
        // Raw SSE, not the accumulated message: `content_block_start` is the
        // earliest point the tool's NAME exists on the wire.
        stream.on('streamEvent', (event) => {
          if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
            onToolStart(event.content_block.name);
          }
        });
      }
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
  /** Connect links this turn's tools actually minted — the pill's provenance. */
  const mintedConnectUrls = new Set<string>();
  let turns = 0;

  try {
    while (turns < MAX_TURNS) {
      turns += 1;
      // Separator between turns so streamed narration and persisted text agree
      // ("…checking now" + "Based on…" must not fuse).
      if (turnTexts.length > 0) args.emit({ type: 'delta', text: '\n\n' });
      const message = await d.streamTurn(
        { system, messages, tools },
        (text) => {
          args.emit({ type: 'delta', text });
        },
        (name) => {
          // UI tools only: a server read-tool's start is already reported by
          // the `tool_start` emit once its input is complete.
          if (UI_TOOL_NAMES.has(name)) args.emit({ type: 'ui_tool_start', name });
        },
      );

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
            // render_artifact is validated HERE, at the chokepoint, so a
            // malformed payload comes back as an is_error tool_result the
            // model repairs in-turn — the browser never renders a guess and
            // the model never believes a broken artifact landed.
            if (call.name === 'render_artifact') {
              const parsed = parseRenderArtifactInput(call.input);
              if (!parsed.success) {
                out.push({
                  type: 'tool_result',
                  tool_use_id: call.id,
                  content: `render_artifact rejected: ${parsed.error.issues
                    .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
                    .join('; ')}. Fix the payload (plain strings/numbers only) and re-emit, or answer in text.`,
                  is_error: true,
                });
                continue;
              }
              args.emit({ type: 'ui_tool', name: call.name, input: { artifact: parsed.data } });
              out.push({
                type: 'tool_result',
                tool_use_id: call.id,
                content: 'Rendered on the session view panel.',
              });
              continue;
            }
            // The pill carries a SERVER-minted link or it does not render:
            // provenance, not a scheme check (see parseRequestConnectionInput).
            if (call.name === 'request_connection') {
              const pill = parseRequestConnectionInput(call.input, mintedConnectUrls);
              if (!pill.ok) {
                out.push({
                  type: 'tool_result',
                  tool_use_id: call.id,
                  content: `request_connection rejected: ${pill.error}`,
                  is_error: true,
                });
                continue;
              }
              args.emit({ type: 'ui_tool', name: call.name, input: pill.value });
              out.push({
                type: 'tool_result',
                tool_use_id: call.id,
                content: 'Connect pill shown in the transcript.',
              });
              continue;
            }
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
          if (result.ok) collectMintedConnectUrls(result.data, mintedConnectUrls);
          // Report tools carry their artifact; the panel gets the payload, the
          // model gets the summary (`tool-artifact.ts`).
          const carried = result.ok ? splitToolArtifact(result.data) : null;
          if (carried) {
            args.emit({ type: 'ui_tool', name: 'render_artifact', input: { artifact: carried.artifact } });
          }
          out.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: result.ok ? JSON.stringify(carried ? carried.modelData : result.data) : result.error,
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
