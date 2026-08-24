/**
 * Server agent loop (plan §3.2) — the Claude tool-use loop behind
 * POST /api/assistant/chat.
 *
 * The model composes three namespaces: the org-scoped read-tool registry
 * (src/lib/assistant/tools), the permission-filtered write tools, and a CLIENT
 * UI namespace that now covers the Warehouse OS itself — tabs, tools, sessions
 * and the canvas. Server tools execute here; UI tool calls are forwarded to the
 * browser through the `emit` sink and acknowledged to the model immediately
 * (standard client-tool pattern), where `runWorkspaceTool` executes them
 * against the workspace store.
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
import type { AssistantToolCtx, AssistantToolDef, AssistantToolRunResult } from '@/lib/assistant/tools/types';
import type { AssistantPageContext } from './context-store';
// Type-only: the dispatch's verb union, so the schema table below cannot drift
// from the handler table. Erases at compile time — the client store graph never
// reaches this server module.
import type { UiToolName } from './workspace-tools';
import { SCAN_SESSION_TYPES } from '@/lib/sessions/types';
// Value imports, but from the two dependency-free modules in that graph: both
// are plain data with no `use client` directive and no browser API, so the
// model's documentation quotes the real cap and the real bench list instead of
// a copy that drifts.
import { MAX_OPEN_TABS } from '@/lib/workspace/types';
import { resolveOrgAnthropicBrain } from '@/lib/ai/org-provider';
import type { OrgId } from '@/lib/tenancy/constants';

/** Fallback model when the connected provider does not name one. */
const ASSISTANT_MODEL = 'claude-opus-4-8';
const MAX_TURNS = 8;
const MAX_TOKENS = 16000;

// ─── UI tools (client-executed) ──────────────────────────────────────────────
//
// These do not run here. The loop emits a `ui_tool` frame and the browser hands
// it to `runWorkspaceTool` — the single dispatch into the workspace store
// (`workspace-tools.ts`). Two consequences worth stating where the schemas live:
//
//   1. The schemas ARE the model's documentation of the Warehouse OS. Nothing
//      else tells it that tool tabs are singletons, that a workspace whose every
//      slot is pinned refuses to open anything, or that exactly one scan session
//      is armed app-wide. Write them for a model reading them cold.
//   2. They are fire-and-forget. The ack goes back in the same tick, before the
//      browser has done anything, so a refusal reaches the OPERATOR (rendered in
//      the transcript) and never the model. `buildSystemCore` says so.
//
// `Record<UiToolName, …>` keys the table off the dispatch's own union, so a verb
// advertised with no handler — or a handler with no schema — is a compile error
// rather than a tool call that vanishes. `name` is derived from the key, so the
// two can never disagree. The import is TYPE-ONLY and erases at compile time:
// no browser-store module is pulled into this server bundle.

type UiToolSpec = {
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
};

const UI_TOOL_SPECS: Record<UiToolName, UiToolSpec> = {
  navigate: {
    description:
      'Navigate the operator\'s browser to an app route. Use for the surfaces that are still route-addressable: /operations?mode=analytics, /studio?focus=<nodeId>, and whatever a tool already handed you an href for (SearchHit, resolve_support_ticket). This does NOT reproduce a tile\'s own state — see open_tile for things that live in the workspace rather than in the URL.',
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
  highlight: {
    description:
      'Visually highlight an entity on the current surface by canonical ref (e.g. "serial_units:entity:9041" or "feed_memberships:feed_key:receiving_triage:entity:123"). Use to point the operator at a specific row/card you are talking about.',
    input_schema: {
      type: 'object',
      properties: { ref: { type: 'string', description: 'Canonical ref of the entity to highlight' } },
      required: ['ref'],
    },
  },
  // Studio canvas view state — drives the /studio URL params in the operator's
  // browser (they navigate to /studio if the operator isn't there).
  focus_node: {
    description:
      'Focus a node on the /studio canvas so the operator sees it (drives ?focus= and zooms to the flow level). Use when discussing or editing a specific node.',
    input_schema: {
      type: 'object',
      properties: { nodeId: { type: 'string' } },
      required: ['nodeId'],
    },
  },
  set_lens: {
    description:
      'Switch the /studio overlay lens: build (structure), live (occupancy), flow (throughput), people (coverage), gaps (diagnostics), static (flow projection).',
    input_schema: {
      type: 'object',
      properties: { lens: { type: 'string', enum: ['build', 'live', 'flow', 'people', 'gaps', 'static'] } },
      required: ['lens'],
    },
  },
  set_zoom: {
    description: 'Set the /studio semantic-zoom depth: 0 department map, 1 flow graph, 2 station detail.',
    input_schema: {
      type: 'object',
      properties: { z: { type: 'integer', enum: [0, 1, 2] } },
      required: ['z'],
    },
  },

  // ── Warehouse OS: window manager ──────────────────────────────────────────
  open_tile: {
    description:
      `Open a tile in the operator's workspace. kind "tool" = a utility they use beside their work (photos, manuals, label-printer, calculator) and ref is its registry key; kind "table" = a data grid and ref is the table id; kind "session" = re-open the tile for a session that already exists and ref is its session id. Tool tiles are SINGLETONS — opening one that is already open focuses it instead of making a second copy — and its tile id is "tool:<key>", which is what you pass to close_tile / pin_tool. OPENING A SESSION TILE DOES NOT RESUME IT and never touches the scanner: use focus_tile to resume, or start_session for new work. The workspace holds ${MAX_OPEN_TABS} tiles and refuses to open more when every slot is pinned.`,
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['session', 'table', 'tool'] },
        ref: {
          type: 'string',
          description:
            'What the tile shows: a tool registry key ("photos"), a table id, or a session id. Anything nothing knows how to mount is refused rather than opened empty.',
        },
        params: {
          type: 'object',
          description:
            'Optional starting view state for THIS tile, e.g. {"sku":"ABC-1"}. Flat scalars only (string / number / boolean) — nested objects are dropped.',
        },
      },
      required: ['kind', 'ref'],
    },
  },
  close_tile: {
    description:
      'Close an open tile — a tool, a table, or a session. Closing a session tile releases the operator\'s live session context (and the scanner with it, if that session was armed) but does NOT end the session record — use end_session for that. Ask before closing work the operator did not tell you to close.',
    input_schema: {
      type: 'object',
      properties: {
        tileId: {
          type: 'string',
          description: 'The tile id, or the bare tool key / session id it was opened with.',
        },
      },
      required: ['tileId'],
    },
  },
  focus_tile: {
    description:
      'Bring an already-open tile to the front and make it live — the shell suspends every tile but the focused one, so this is what resumes it. If it is a SCAN session tile, focusing it ARMS that bench and disarms whichever scan session held the scanner before; say that out loud when you do it. Use open_tile when the tile is not open, start_session when the session does not exist yet.',
    input_schema: {
      type: 'object',
      properties: {
        tileId: {
          type: 'string',
          description:
            'The tile id, the bare tool key / session id, or — when only one such session is open — its bench, e.g. "unbox".',
        },
      },
      required: ['tileId'],
    },
  },
  split_tile: {
    description:
      'Split the canvas and optionally put an already-open tile in the pane you split from. Use for "put the manual next to it" — a finer instrument than set_layout, which rearranges everything. Directions "left"/"right" split side by side; "up"/"down" split stacked; "row"/"column" say the same thing in the canvas\'s own words.',
    input_schema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['right', 'left', 'up', 'down', 'row', 'column'] },
        tileId: {
          type: 'string',
          description: 'Optional: the open tile whose pane to split. Omit to split whatever is focused.',
        },
      },
      required: ['direction'],
    },
  },

  // ── Warehouse OS: arrangement ─────────────────────────────────────────────
  set_layout: {
    description:
      'Arrange the canvas. Either a SHAPE — "single" one full-width tile, "columns" side by side, "rows" stacked, "grid" a four-tile bento — or the id of a layout the operator saved earlier with save_layout. Use a shape when the operator describes what they want to see; use layoutId when they name a preset ("my unbox setup"). Pass one or the other, not both.',
    input_schema: {
      type: 'object',
      properties: {
        layout: { type: 'string', enum: ['single', 'columns', 'rows', 'grid'] },
        layoutId: {
          type: 'string',
          description: 'Id of a saved layout, e.g. "unbox:morning-bench". Takes precedence over layout.',
        },
      },
      required: [],
    },
  },
  save_layout: {
    description:
      `Save how the canvas is arranged RIGHT NOW as a named preset the operator can call back with set_layout. Give sessionType to file it under a kind of work (${SCAN_SESSION_TYPES.join(', ')}, or "task"), which is how "my unbox setup" and "my packing setup" stay separate presets. Saving under a name that already exists REPLACES it. Only save when the operator asks — a preset they did not ask for is clutter they have to find and delete.`,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What the operator calls this arrangement, in their words.' },
        sessionType: {
          type: 'string',
          enum: [...SCAN_SESSION_TYPES, 'task'],
          description: 'The kind of work this layout is for. Omit for a general-purpose preset.',
        },
      },
      required: ['name'],
    },
  },

  // ── Warehouse OS: session lifecycle ───────────────────────────────────────
  start_session: {
    description:
      'Start a NEW unit of work and make it the operator\'s live session: opens a session tile, focuses it, and publishes it to the header. Give scanType to start a SCAN session — the operator is about to put barcodes in front of a bench, and EXACTLY ONE scan session is armed app-wide, so this automatically disarms whichever scan session held the scanner before. Say that out loud when you do it. Omit scanType for a task session; any number of those may be open. You cannot arm two scan sessions and there is no parameter that would let you try.',
    input_schema: {
      type: 'object',
      properties: {
        scanType: {
          type: 'string',
          enum: [...SCAN_SESSION_TYPES],
          description:
            'The bench this session scans at. Omit entirely for a task session (no bench, no scanner).',
        },
        title: {
          type: 'string',
          description:
            'What the operator is doing, in their words. Defaults to the bench name for a scan session, "Task" otherwise.',
        },
      },
      required: [],
    },
  },
  end_session: {
    description:
      'End a session for good — closes the record, disarms it if it held the scanner, and closes its tile. This is not the same as close_tile, which puts the window away and leaves the session running. Ending is not reversible, so only do it when the operator says they are done with that work.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session id, its tile id ("session:<sessionId>"), or its bench when only one is open.',
        },
      },
      required: ['sessionId'],
    },
  },

  // ── Warehouse OS: tool palette ────────────────────────────────────────────
  pin_tool: {
    description:
      `Pin a tool (or any open tile) so it survives eviction. The workspace holds at most ${MAX_OPEN_TABS} tiles and evicts the oldest unpinned, unfocused one to make room — but it will never drop a pin, so a workspace whose every slot is pinned REFUSES to open anything new. Pin what the operator asked to keep; do not pin on your own initiative.`,
    input_schema: {
      type: 'object',
      properties: {
        toolKey: {
          type: 'string',
          description:
            'The tool\'s registry key ("photos"), or any open tile id ("session:<id>", "tool:<key>").',
        },
      },
      required: ['toolKey'],
    },
  },
  unpin_tool: {
    description:
      'Release a pin. This is how you make room in a workspace that refused to open something because every slot was pinned — tell the operator which pin you are proposing to release before you do it.',
    input_schema: {
      type: 'object',
      properties: {
        toolKey: {
          type: 'string',
          description: 'The tool\'s registry key, or any open tile id.',
        },
      },
      required: ['toolKey'],
    },
  },
};

export const UI_TOOLS: Anthropic.Tool[] = Object.entries(UI_TOOL_SPECS).map(([name, spec]) => ({
  name,
  description: spec.description,
  input_schema: spec.input_schema,
}));

const UI_TOOL_NAMES: ReadonlySet<string> = new Set(Object.keys(UI_TOOL_SPECS));

// ─── System prompt ───────────────────────────────────────────────────────────

/** Stable core — byte-identical across requests so the prompt cache holds. */
export function buildSystemCore(toolNames: string[]): string {
  return [
    'You are the operations assistant embedded in a used-electronics reseller operations platform (receiving, testing, repair, listing, fulfillment, returns).',
    'You answer questions about THIS organization\'s live operation using your read tools — never from memory. Compose tools per question: identifiers / find / where / which → hybrid_entity_search or exact_id_serial_search; #ticket → resolve_support_ticket; full history / trace / what happened → get_operations_journey; serial return / which order shipped this serial → lookup_serial; warranty / coverage / expired → lookup_warranty_coverage or list_warranty_claims; specific order id or tracking → get_order_lookup; my tech queue → get_my_tech_queue; assignments → get_assignments; photos → search_photos; receiving by tracking → get_receiving_by_tracking; packing pace / packer KPIs → get_packing_kpi; aggregates / why failing → get_top_reasons / get_kpis / get_signals_by_node; then drill with get_unit_journey, search_notes, get_node_detail.',
    'When the answer depends on operational data not already in the conversation, you MUST call a read tool before answering.',
    'If you have the propose_mutation tool you can make changes. The trust model is automatic — you never decide whether a change is applied: view-layer changes (dismiss a rail item, set a feed item state, record a signal, tune a node surface) apply immediately; workflow DRAFT edits (add/remove/wire/config a node in a draft graph) apply to a draft the user can preview and revert; changes to masters (create staff, add a reason code, change a setting) are queued for review. ALWAYS set the user\'s expectation from the returned status: "applied to your draft", "done", or "queued for review — a human needs to apply it". For draft graph edits, use the canvas-control tools (focus_node/set_lens/set_zoom) to show the user the change, and remind them publishing stays their step (you can request it, you cannot publish).',
    `THE SHELL: this app is a Warehouse OS, not a set of pages — an always-mounted HUD with a rail of TILES, a tiling canvas, and a palette of TOOLS. Four object types. A SESSION is a unit of human work: kind "scan" (the operator is scanning barcodes at a named bench — ${SCAN_SESSION_TYPES.join(', ')}) or kind "task" (no bench). A TABLE is a data-grid instance. A TOOL is a utility usable from anywhere (photos, manuals, label printer, calculator). A TILE is a handle on one of those while it is open. EXACTLY ONE scan session is armed app-wide: starting or resuming a scan session takes the scanner from whichever bench held it, by construction — you cannot hold two, so name the trade when you switch ("that arms Packing, so Unbox stops receiving scans").`,
    'STATE IS NOT IN THE URL. Each tile owns its own params — sort, filter, selection, which record is open — and those never appear in the address bar; the URL names at most the focused tile. Two tiles of the same table legitimately show different things. So: do not tell the operator to bookmark or share a link to reproduce what they are looking at, do not assume a path you can name restores a tile, and do not reason about "the current page" as if it were the whole state. Ask, or read the page context you were given.',
    'YOU ARE NOT IN THE SCAN PATH, AND MUST NEVER PUT YOURSELF IN IT. A barcode scan is a 50ms hardware event the shell handles on its own; you are a 1-3 second round trip. Never offer to "scan that for" the operator, never ask them to route a scan through you, never claim a scan happened, and never tell someone to wait for you before they scan. If a scanner or a bench is misbehaving, say what you can see and let them keep working. Your job is arrangement, presets and reflection: open and lay out the tiles, save the setups, and afterwards tell them how the session went.',
    `WORKSPACE TOOLS run in the operator's browser and are FIRE-AND-FORGET — you are told they were dispatched, never what happened. open_tile / close_tile / focus_tile / pin_tool / unpin_tool manage tiles; split_tile / set_layout / save_layout arrange the canvas; start_session / end_session manage the unit of work; navigate still opens the routes that have not been re-parented into tiles yet; highlight points at one record already on screen. Refusals you will not see: the workspace holds ${MAX_OPEN_TABS} tiles and refuses to open more when every slot is PINNED (unpin one), an id that is not open is ignored, a ref nothing knows how to mount is refused rather than opened empty, and saved layouts may not be wired in this workspace yet. Narrate what you did in one short clause; if the operator says nothing happened, ask what they see instead of firing the same call again.`,
    'SESSION REFLECTION is the other half of your job. get_my_session_stats answers "how long did that take" and "how long was I stopped"; get_session_throughput answers "what did I actually get through"; get_team_session_stats is the shift view. Read them before you answer a question about pace, and quote what they return. Two rules they encode and you must not break: a RUNNING session has no final duration (say "so far"), and a gap between sessions is not idle time unless the tool says so — an unknown gap is unknown, never "you were idle", because you cannot see when someone was off the clock.',
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
  /** Sink for streaming events to the client (SSE writer). */
  emit: (event: AssistantEmit) => void;
}

export interface RunAssistantTurnResult {
  ok: boolean;
  /** Final assistant text (what gets persisted + rendered). */
  text: string;
  turns: number;
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
  // Write tools filtered by permission; dispatched in-process by name.
  const writeDefs = (args.writeTools ?? []).filter((t) => args.ctx.permissions.has(t.permission));
  const writeMap = new Map(writeDefs.map((t) => [t.name, t]));
  const writeTools = writeDefs.map(toSchema);
  const tools = [...serverTools, ...writeTools, ...UI_TOOLS];

  async function runWriteTool(name: string, rawInput: unknown): Promise<AssistantToolRunResult> {
    const tool = writeMap.get(name);
    if (!tool) return { ok: false, code: 'unknown_tool', error: `Unknown write tool "${name}"` };
    if (!args.ctx.permissions.has(tool.permission)) {
      return { ok: false, code: 'forbidden', error: `Missing permission ${tool.permission}` };
    }
    const parsed = tool.inputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) return { ok: false, code: 'invalid_input', error: parsed.error.message };
    try {
      const data = await tool.run(parsed.data, args.ctx, {} as never);
      // A write tool that resolves with { ok: false, error } is a domain
      // failure (validation / 404 / 409), not a thrown error — surface it as
      // is_error so the model and any tool_end consumer see it as failed,
      // matching how read-tool failures are reported.
      if (data && typeof data === 'object' && (data as { ok?: unknown }).ok === false) {
        return { ok: false, code: 'tool_error', error: String((data as { error?: unknown }).error ?? 'write failed') };
      }
      return { ok: true, data };
    } catch (err) {
      return { ok: false, code: 'tool_error', error: err instanceof Error ? err.message : String(err) };
    }
  }

  const system: Anthropic.Messages.TextBlockParam[] = [
    {
      type: 'text',
      text: buildSystemCore(tools.map((t) => t.name)),
      cache_control: { type: 'ephemeral' },
    },
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

  const turnTexts: string[] = [];
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

      // Execute ALL tool calls, return ALL results in ONE user message.
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of toolUses) {
        if (UI_TOOL_NAMES.has(call.name)) {
          // Client tool: forward to the browser, acknowledge to the model.
          args.emit({ type: 'ui_tool', name: call.name, input: call.input });
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content:
              'Dispatched to the operator\'s browser. Client tools return no result — continue without waiting for one, and do not repeat the call to check.',
          });
          continue;
        }
        args.emit({ type: 'tool_start', name: call.name, input: call.input });
        const result = writeMap.has(call.name)
          ? await runWriteTool(call.name, call.input)
          : await d.runTool(call.name, call.input, args.ctx);
        args.emit({ type: 'tool_end', name: call.name, ok: result.ok });
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: result.ok ? JSON.stringify(result.data) : result.error,
          is_error: !result.ok || undefined,
        });
      }
      messages.push({ role: 'user', content: results });
    }

    let finalText = turnTexts.join('\n\n');
    if (turns >= MAX_TURNS && !finalText) {
      finalText = 'I ran out of steps while researching that — try a narrower question.';
    }
    return { ok: true, text: finalText, turns };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'assistant error';
    args.emit({ type: 'error', message });
    return { ok: false, text: turnTexts.join('\n\n'), turns, error: message };
  }
}
