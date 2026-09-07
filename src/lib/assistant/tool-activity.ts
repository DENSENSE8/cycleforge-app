/**
 * Loading copy for the assistant's active-tool line.
 *
 * While a turn runs, the chat pane shows exactly one transient line naming
 * what the agent is doing right now (`AgentSessionPanel`, driven by the SSE
 * `tool` event's `status: 'start'`). That line used to render the raw tool id
 * with its underscores swapped for spaces — `get_packing_kpi` became
 * "get packing kpi", which reads like a leaked internal and tells a packer
 * nothing.
 *
 * So: one central map, tool id → operator-facing present participle. Central
 * rather than a `label` field on each `AssistantToolDef` because a description
 * is model-facing prose and this is human-facing chrome; keeping them apart
 * stops a copy edit from touching the model's tool contract, and keeps all 40
 * strings greppable in one file when the voice is tuned.
 *
 * Voice rules (DESIGN.md — quiet chrome, sentence case, no shouting):
 *  - Present participle, the operator's noun ("carton", not "receiving row").
 *  - No trailing ellipsis or period: the CALLER owns the "…", so the same
 *    phrase can be reused in a status bar or an aria-live region without
 *    getting two.
 *  - Short enough to survive the 360px minimum chat pane on one line.
 *
 * `tool-activity.test.ts` is the tripwire: every name in `ASSISTANT_TOOLS`
 * must have an entry here, so a new tool cannot ship with a leaked id as its
 * loading copy.
 */

/**
 * The two session-scoped write tools (`buildWriteTools`). They are not in
 * `ASSISTANT_TOOLS` — they are built per request so the mutation links to the
 * chat session — but they emit the same `tool` event, so they need the same
 * copy.
 */
export const WRITE_TOOL_NAMES = ['propose_mutation', 'revert_mutation'] as const;

/** Tool id → the line shown while it runs. The tripwire reads these keys. */
export const TOOL_ACTIVITY_PHRASES: Readonly<Record<string, string>> = {
  // ── Operations graph / signals ──────────────────────────────────────────
  get_signals_by_node: 'Grouping signals by station',
  get_top_reasons: 'Ranking the top reasons',
  get_kpis: 'Totalling the KPIs',
  get_benchmarks: 'Pulling industry benchmarks',
  get_graph: 'Loading the operations graph',
  get_node_detail: 'Opening that station',
  get_feed_state: 'Reading the feed',
  search_notes: 'Searching notes',

  // ── Identity / search ───────────────────────────────────────────────────
  hybrid_entity_search: 'Searching the warehouse',
  exact_id_serial_search: 'Matching that identifier',
  resolve_item_number: 'Resolving the item number',
  list_staff: 'Looking up staff',

  // ── One thing's story ───────────────────────────────────────────────────
  get_unit_journey: 'Walking the unit journey',
  get_operations_journey: 'Tracing the cross-station timeline',
  get_order_lookup: 'Looking up the order',
  lookup_serial: 'Looking up the serial',

  // ── Receiving / photos ──────────────────────────────────────────────────
  get_receiving_by_tracking: 'Finding the carton',
  resolve_receiving_line_for_order: 'Finding the receiving line',
  list_receiving_line_photos: 'Listing the line photos',
  search_photos: 'Searching the photo library',

  // ── Packing ─────────────────────────────────────────────────────────────
  get_packing_kpi: 'Reading the packing KPIs',

  // ── Warranty ────────────────────────────────────────────────────────────
  lookup_warranty_coverage: 'Checking warranty coverage',
  list_warranty_claims: 'Listing warranty claims',

  // ── Support ─────────────────────────────────────────────────────────────
  resolve_support_ticket: 'Resolving the support ticket',
  get_ticket_entities: 'Following the ticket links',
  list_support_followups: 'Gathering support follow-ups',
  draft_ticket_reply: 'Drafting the reply',

  // ── The operator's own work ─────────────────────────────────────────────
  get_my_day: 'Building your day',
  get_my_tech_queue: 'Reading your tech queue',
  get_assignments: 'Checking work assignments',
  get_project_tasks: 'Gathering project tasks',
  get_daily_checks: 'Reading the daily checks',

  // ── The assistant's own memory ──────────────────────────────────────────
  get_chat_history: 'Recalling earlier conversations',
  get_mutation_history: 'Reviewing my change history',

  // ── Writes (session-scoped) ─────────────────────────────────────────────
  propose_mutation: 'Proposing the change',
  revert_mutation: 'Reverting the change',

  // ── Order intake (session surface) ──────────────────────────────────────
  triage_orders_csv: 'Triaging the pasted orders',

  // ── Where the operation is leaking ──────────────────────────────────────
  get_roi_gaps: 'Finding where we are leaking',

  // ── Station composition (Studio) ────────────────────────────────────────
  get_station_catalog: 'Listing the station parts',

  // ── The five operator reports ───────────────────────────────────────────
  get_packing_performance: 'Building the packing report',
  get_unbox_backlog: 'Counting the unbox backlog',
  get_order_value_rank: 'Ranking orders by value',
  get_roi_rank: 'Ranking the gaps by priority',
  get_delegation_plan: 'Matching staff to the gaps',

  // ── The staffer's own outside apps (Composio) ───────────────────────────
  list_connected_apps: 'Checking your connected apps',
  connect_app: 'Getting you a connect link',
  search_staff_documents: 'Searching your Google Docs',
  read_staff_document: 'Reading that document',

  // ── Tool forge gateway ──────────────────────────────────────────────────
  search_tool_registry: 'Checking the tool registry',
  submit_approval_decision: 'Recording the triage decision',
  execute_build_sandbox: 'Type-checking in the sandbox',
  commit_to_git: 'Filing the change for review',
};

/**
 * The line to show while `name` is running. Caller appends its own "…".
 *
 * `name` is whatever the MODEL emitted, so the lookup is own-property only:
 * a call named `__proto__` / `constructor` / `toString` used to resolve
 * through the object prototype and hand the chat pane an object or a
 * function to render. The fallback is bounded for the same reason.
 */
export function toolActivityPhrase(name: string): string {
  const phrase = Object.hasOwn(TOOL_ACTIVITY_PHRASES, name)
    ? TOOL_ACTIVITY_PHRASES[name]
    : undefined;
  if (typeof phrase === 'string' && phrase.length > 0) return phrase;
  // No entry is a test failure, not a runtime one: humanise the id rather
  // than render it raw, and never render an empty line.
  const words = name.replaceAll('_', ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (words.length === 0) return 'Working';
  return words.charAt(0).toUpperCase() + words.slice(1);
}
