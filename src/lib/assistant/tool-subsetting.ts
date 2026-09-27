/**
 * Tool advertisement subsetting for self-hosted model runtimes (train
 * handoff §3). The dock advertises every permission-visible verb (~54 wire
 * tools, ~35 kB) on every round; a local 8B pays that whole block as prefill
 * every time — first_token_ms is prefill-bound, not decode-bound (measured
 * 11.8 s @ 54 tools vs 1.2 s @ 3 tools on the same hardware).
 *
 * This module picks the ~8–10 tools THIS turn needs:
 *   • an always-on core: the two entity finders (the system core routes every
 *     find/where/which question to them), `render_artifact` (mandatory for
 *     data answers), and `propose_mutation` (the one write chokepoint);
 *   • keyword-driven UI tools (navigate/highlight/canvas/print/connection);
 *   • everything else by deterministic relevance: alias hits on house
 *     vocabulary first, then description-word overlap as the fallback signal.
 *
 * The same function must decide what production advertises and what the
 * training set embeds, so it lives in src/ with a test, not in a script.
 * Selection reads ONLY the turn text and page context — never the model, so
 * it is identical across seeds and replayable in evals.
 */

import type { OpenAiFunctionTool } from '@/lib/assistant/tools/openai-schema';

/** Total advertisement budget for a self-hosted turn (core + UI + ranked).
 * 8 not 10: measured on the 16 GB card, 10-tool rows push QLoRA training
 * activations past what is left after the OS desktop — and the wire budget
 * only improves (≈9.6 kB at 8). Still inside the handoff's "~8–10" target. */
export const SELF_HOSTED_TOOL_CAP_DEFAULT = 13;

/** Server verbs every turn can reach for, whatever the question was. */
const ALWAYS_ON_CORE: Record<string, true> = {
  hybrid_entity_search: true,
  exact_id_serial_search: true,
};

/** The write chokepoint — subsetting it out would make write asks unanswerable. */
const ALWAYS_ON_WRITES: Record<string, true> = { propose_mutation: true };

/** Mandatory on every self-hosted turn: data answers land through it. */
const ALWAYS_ON_UI: Record<string, true> = { render_artifact: true };

/**
 * The five operator reports are ALWAYS advertised (angle 16): a self-hosted
 * wire only sees the subsetted list, so keyword-ranking them meant an owner
 * phrasing the ranker did not recognize — "how did the pack bench do today?" —
 * made the report not exist on the local box. The cap carries them: 4 core
 * slots + 5 reports + 4 ranked.
 */
const ALWAYS_ON_REPORTS: Record<string, true> = {
  get_packing_performance: true,
  get_unbox_backlog: true,
  get_order_value_rank: true,
  get_roi_rank: true,
  get_delegation_plan: true,
};

/** UI verbs that ride only when the turn names their trigger. */
const UI_KEYWORDS: Record<string, readonly string[]> = {
  navigate: ['open the', 'go to', 'take me to', 'navigate to', 'jump to'],
  highlight: ['highlight', 'point at', 'point me at', 'mark the row'],
  focus_node: ['focus on the node', 'focus node'],
  set_lens: ['lens'],
  set_zoom: ['zoom'],
  print_handling_unit_labels: ['print', 'label', 'sticker'],
  request_connection: ['connect'],
};

/**
 * House-vocabulary routing aliases per tool — the phrases an operator
 * actually types. Alias hits outweigh description overlap 10:1 so these win
 * when both fire. Keep aliases aligned with the tool descriptions in the
 * registry; when a golden shows a miss here, add the phrase, not a golden.
 */
const TOOL_ALIASES: Record<string, readonly string[]> = {
  get_signals_by_node: ['signals', 'why failing', 'node signals', 'problem cluster'],
  get_top_reasons: ['top reasons', 'reasons for', 'why are', 'fail reasons', 'return reasons', 'why did'],
  get_unit_journey: ['unit story', 'unit journey', 'story of this unit', 'lifecycle of the serial'],
  get_feed_state: ['feed', 'working set', 'queue state'],
  get_graph: ['workflow graph', 'operations graph', 'the graph', 'nodes and edges', 'whole workflow'],
  get_node_detail: ['node detail', 'station detail', 'occupancy', 'one station', 'this node'],
  get_benchmarks: ['benchmark', 'industry', 'typical values', 'how do we compare', 'vertical'],
  get_kpis: ['kpi', 'kpis', 'throughput', 'event counts', 'how many received', 'how many shipped', 'weekly throughput', 'received this week', 'kpi rollup'],
  search_notes: ['notes', 'buyer note', 'reason code', 'search reasons', 'tech notes'],
  get_mutation_history: ['what did you change', 'mutation history', 'your changes', 'what have you changed'],
  get_chat_history: ['chat history', 'previous conversations', 'past sessions', 'as we discussed', 'yesterday we'],
  resolve_support_ticket: ['support ticket', 'ticket scan', 'ticket number', 'the ticket'],
  get_operations_journey: ['what happened to', 'journey', 'full history', 'trace', 'timeline', 'cross-station'],
  get_order_lookup: ['order id', 'tracking number', 'look up order', 'specific order'],
  get_order_documents: ['shipping label', 'packing slip', 'paperwork', 'invoice', 'order documents', 'label for order', 'slip for order', 'show me the label', 'pull up the label'],
  lookup_serial: ['serial return', 'shipped this serial', 'is this a return', 'return-intake', 'which order'],
  lookup_warranty_coverage: ['warranty', 'coverage', 'under warranty', 'when does the warranty'],
  list_warranty_claims: ['warranty claims', 'claims', 'claim status', 'open claims'],
  get_assignments: ['who is assigned', 'assignments', 'work orders', 'assigned to', 'test queue', 'repair queue'],
  get_my_tech_queue: ['my queue', 'my tech', 'my inbox', 'my cartons', 'my returns'],
  list_support_followups: ['follow-up', 'followups', 'follow-ups', 'support inbox'],
  search_photos: ['photos', 'photo', 'pictures', 'damage', 'media library'],
  get_receiving_by_tracking: ['which carton', 'receiving carton', 'carton for', 'receiving for this'],
  get_ticket_entities: ['zendesk', 'ticket entities', 'ticket link'],
  get_packing_kpi: ['packing pace', 'packer', 'packed most', 'packing kpi', 'are we on capacity', 'pack rate', 'packing performance', 'packer counts', 'last shift'],
  resolve_receiving_line_for_order: ['line for order', 'photos from order', 'move the photos', 'lines on'],
  list_receiving_line_photos: ['photos on the line', 'line photos', 'photos on this carton'],
  locate_product: ['where is', 'which bin', 'what bin', 'locate', 'find sku', 'how many do we have', 'in stock', 'on hand', 'fnsku', 'asin', 'upc'],
  list_location_contents: ['in bin', 'bin contents', 'what is in', "what's in", 'contents of', 'on the shelf', 'in location'],
  resolve_item_number: ['item number', 'create a rule', 'resolve product', 'asin', 'listing rule'],
  list_staff: ['staff', 'who works', 'teammate', 'staff id', 'staffers', 'named'],
  draft_ticket_reply: ['draft a reply', 'reply to the ticket', 'ticket reply', 'draft reply'],
  get_daily_checks: ['daily checks', 'checklist', 'checked in today', 'checks for'],
  get_my_day: ['my day', 'what should i work on', 'waiting on me', 'do next', 'anything for me'],
  get_project_tasks: ['project tasks', 'ops plan', 'plan tasks', 'project inbox', 'still open on'],
  triage_orders_csv: ['csv', 'import orders', 'pasted orders', 'triage this', 'pending orders spreadsheet'],
  list_connected_apps: ['connected apps', 'my apps', 'integrations', 'which apps'],
  connect_app: ['connect', 'sign in to', 'hook up'],
  search_staff_documents: ['google docs', 'my docs', 'search documents', 'handbook', 'document search', 'ops handbook', 'sop', 'find the doc'],
  read_staff_document: ['read the document', 'read the doc', 'document text', 'open the doc', 'read the handbook', 'read the ops handbook', 'what does the sop say', 'show me the text of'],
  get_roi_gaps: ['roi', 'gaps', 'leaking', 'losing money', 'fix first', 'biggest gaps', 'where are we losing'],
  get_station_catalog: ['station catalog', 'parts list', 'blocks', 'composition', 'station builder'],
  // The five operator reports. These aliases are the OWNER'S OWN SENTENCES —
  // the phrases he types, not the tool's vocabulary. A self-hosted runtime only
  // sees a subsetted advertisement, so a report the keywords cannot reach is a
  // report that does not exist on the local box.
  get_packing_performance: [
    'packing performance',
    'how many boxes did',
    'packer efficiency',
    'wait minutes',
    'minutes per box',
    'packed today',
    'pack floor',
  ],
  get_unbox_backlog: [
    'left to be unboxed',
    'unbox backlog',
    'boxes to open',
    'waiting at receiving',
    'packages to open',
    'not unboxed',
  ],
  get_order_value_rank: [
    'most expensive order',
    'highest value order',
    'biggest order',
    'value in the building',
    'expensive order in the warehouse',
  ],
  get_roi_rank: [
    'highest roi',
    'highest rois',
    'biggest gaps',
    'clear the backlog',
    'fix first',
    'where are we leaking',
  ],
  get_delegation_plan: [
    'delegate',
    'who should attack',
    'who is free',
    'pending tasks',
    'roster load',
    'who can i send',
  ],
  search_tool_registry: ['tool forge', 'registry of tools', 'search the tool registry'],
  submit_approval_decision: ['approval', 'approve the request', 'decision on the request'],
  execute_build_sandbox: ['build sandbox', 'run the build', 'sandbox'],
  commit_to_git: ['commit', 'git', 'branch'],
  revert_mutation: ['undo', 'revert', 'undo that', 'revert it'],
  // The operator's own sentences for pairing a dropped file, plus the replies
  // that confirm or cancel a pending link on the next turn.
  link_manual_to_sku: [
    'link this manual',
    'link the manual',
    'attach this manual',
    'manual to sku',
    'manual',
    'link',
    'attach',
    'print outs',
    'confirm',
    'yes',
    'go ahead',
    'cancel the link',
  ],
};

/** Words too common to carry routing signal. */
const STOPWORDS: Record<string, true> = {
  the: true, a: true, an: true, this: true, that: true, these: true, those: true, what: true,
  which: true, when: true, where: true, how: true, why: true, who: true, is: true, are: true,
  was: true, were: true, be: true, been: true, being: true, do: true, does: true, did: true,
  for: true, from: true, with: true, without: true, and: true, or: true, but: true, not: true,
  no: true, yes: true, to: true, of: true, in: true, on: true, at: true, by: true, as: true,
  it: true, its: true, we: true, our: true, us: true, you: true, your: true, i: true, me: true,
  my: true, can: true, could: true, should: true, would: true, will: true, shall: true,
  may: true, might: true, have: true, has: true, had: true, there: true, their: true,
  them: true, they: true, about: true, into: true, over: true, please: true, just: true,
  any: true, all: true, some: true, more: true, most: true, much: true, many: true,
  show: true, tell: true, give: true, want: true, need: true, know: true, get: true,
  got: true, today: true, now: true, up: true, out: true,
};

/** UI verb names — the flat keyword table above keys off these. */
const UI_NAMES: Record<string, true> = {
  navigate: true,
  highlight: true,
  focus_node: true,
  set_lens: true,
  set_zoom: true,
  render_artifact: true,
  print_handling_unit_labels: true,
  request_connection: true,
};

function aliasRegex(alias: string): RegExp {
  const body = alias.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${body}(?:[^a-z0-9]|$)`, 'i');
}

/**
 * Alias content tokens — the alias words that actually carry routing signal.
 *
 * `aliasRegex` is whole-phrase: one absent stopword takes a hit from 10 to 0.
 * Measured on the goldens, that is how "status of tracking 1Z58104A9021123456"
 * missed `'tracking number'` and "Is serial 35678904561 a return" missed
 * `'is this a return'`. An operator does not type the connective words, so a
 * phrase match is scored by COVERAGE of its content tokens instead of all-or
 * -nothing. A partial hit still outranks the +1 description noise that used to
 * win those slots.
 */
function aliasContentTokens(alias: string): string[] {
  return alias
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOPWORDS[w]);
}

/** Whole-word test. `includes` matched "bench" inside "benchmarks". */
function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`, 'i').test(haystack);
}

/**
 * RECALL FLOOR — the advertisement may narrow, but it may never drop the tool
 * the turn is explicitly ABOUT.
 *
 * An operator who types an identifier has named the tool implicitly, and no
 * keyword ranker should be able to outvote that. Each entry is a SHAPE in the
 * turn text and the verb that resolves it; a hit scores far above any alias so
 * the tool is guaranteed a slot. This is
 * `TURN_DETERMINISM_LAW.subsetNeverEvictsTheSubject` made mechanical — the
 * alternative (one more alias string per miss) is what let this recur from
 * iteration 1 to iteration 5.
 *
 * Order matters: the first matching shape wins for a given tool, and a turn may
 * float several tools (a prompt naming an order AND a serial wants both).
 */
const RECALL_FLOOR: readonly { shape: RegExp; tool: string; why: string }[] = [
  { shape: /\btracking\b|\b1z[0-9a-z]{10,}\b/i, tool: 'get_order_lookup', why: 'a tracking number is an order question' },
  { shape: /\bord-\s?\d+\b/i, tool: 'get_order_lookup', why: 'ORD- is the order id shape' },
  {
    shape: /\b(shipping\s+labels?|packing\s+slips?|paperwork|invoices?)\b|\border\b[^.?!]*\b(labels?|slips?|documents?|docs?)\b|\b(labels?|slips?|documents?|docs?)\b[^.?!]*\border\b/i,
    tool: 'get_order_documents',
    why: 'an order\'s label / slip / paperwork is the order document reader, not document search or label printing',
  },
  { shape: /\bserial\b|\bsn-\s?\w+\b/i, tool: 'lookup_serial', why: 'a serial is a unit question' },
  { shape: /\bdoc_\w+\b/i, tool: 'read_staff_document', why: 'doc_ is a document id — read it, do not search' },
  { shape: /\b(document|doc|docs|handbook|sop)\b/i, tool: 'search_staff_documents', why: 'document vocabulary must reach document search' },
  { shape: /\btools?\b.*\b(exist|available|registry|forge)\b|\b(what|which)\s+tools?\b/i, tool: 'search_tool_registry', why: 'asking what tools exist is the registry, not the media library' },
  { shape: /\bsku-\w+\b|\bitem\s*(number|#)\b/i, tool: 'resolve_item_number', why: 'an item number is a resolution question' },
  { shape: /\bwhere\s+(is|are|do)\b|\bwhich\s+bins?\b|\b(sku|fnsku|asin|upc|gtin)\b|\bx00[a-z0-9]{7}\b|\bb0[a-z0-9]{8}\b/i, tool: 'locate_product', why: 'a where-is / identifier question is a location lookup' },
  { shape: /\b(bin|location|shelf|slot)\b/i, tool: 'list_location_contents', why: 'bin vocabulary must reach the bin reader' },
  {
    shape: /\b(link|attach|pair)\w*\b[^.?!]*\bmanuals?\b|\bmanuals?\b[^.?!]*\b(link|attach|pair|sku)\w*\b/i,
    tool: 'link_manual_to_sku',
    why: 'pairing a manual with a SKU is the manual link write, not a location lookup',
  },
];

/** Score awarded by a recall-floor hit — above any achievable alias total. */
const RECALL_FLOOR_SCORE = 1000;

/**
 * An `@` mention is an exact entity the operator picked, so its reader rides
 * the advertisement like a recall-floor hit — the id is already resolved and
 * the tool that consumes it must be callable.
 */
const MENTION_TOOLS: Record<'order' | 'sku' | 'bin', readonly string[]> = {
  order: ['get_order_lookup'],
  sku: ['locate_product'],
  bin: ['list_location_contents', 'locate_product'],
};

export interface ToolSubsetQueryContext {
  page?: string | null;
  mode?: string | null;
  station?: string | null;
  mentions?: ReadonlyArray<{ kind: 'order' | 'sku' | 'bin' }> | null;
  /** Files uploaded with this message — their consumer must be callable. */
  attachments?: ReadonlyArray<unknown> | null;
}

export interface ToolSubsetResult {
  /** The advertisement to send, core first then ranked by score. */
  tools: OpenAiFunctionTool[];
  /** Names always advertised regardless of the turn text. */
  mandatoryNames: string[];
  /** Relevance-picked names, best first. Empty when nothing matched. */
  rankedNames: string[];
}

/**
 * Deterministic per-turn advertisement. `tools` arrives in production order
 * (registry, writes, UI); the result keeps that order within each tier so the
 * wire bytes are stable for identical inputs.
 */
export function subsetAdvertisedTools(
  userMessage: string,
  context: ToolSubsetQueryContext | null | undefined,
  tools: readonly OpenAiFunctionTool[],
  cap: number = SELF_HOSTED_TOOL_CAP_DEFAULT,
): ToolSubsetResult {
  const queryText = [
    userMessage,
    context?.page ?? '',
    context?.mode ?? '',
    context?.station ?? '',
  ]
    .join('\n')
    .toLowerCase();
  const queryWords = new Set(
    queryText
      .split(/[^a-z0-9#]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS[w]),
  );

  const mentioned = new Set((context?.mentions ?? []).flatMap((m) => MENTION_TOOLS[m.kind] ?? []));
  if ((context?.attachments ?? []).length > 0) mentioned.add('link_manual_to_sku');
  const mandatory: OpenAiFunctionTool[] = [];
  const ranked: Array<{ tool: OpenAiFunctionTool; score: number }> = [];

  for (const tool of tools) {
    const name = tool.function.name;
    const isUi = !ALWAYS_ON_CORE[name] && !ALWAYS_ON_WRITES[name] && UI_NAMES[name] === true;
    if (ALWAYS_ON_CORE[name] || ALWAYS_ON_WRITES[name] || ALWAYS_ON_UI[name] || ALWAYS_ON_REPORTS[name]) {
      mandatory.push(tool);
      continue;
    }
    let score = 0;
    if (isUi) {
      const keywords = UI_KEYWORDS[name] ?? [];
      if (keywords.some((k) => aliasRegex(k).test(queryText))) score += 10;
    } else {
      for (const alias of TOOL_ALIASES[name] ?? []) {
        if (aliasRegex(alias).test(queryText)) {
          score += 10;
          continue;
        }
        // Partial credit by content-token coverage, so a missing connective
        // ("tracking [number]", "is [this] a return") degrades instead of
        // vanishing. Single-token aliases are already covered by the exact test.
        const tokens = aliasContentTokens(alias);
        if (tokens.length < 2) continue;
        const hit = tokens.filter((t) => hasWord(queryText, t)).length;
        if (hit > 0) score += Math.round((10 * hit) / tokens.length);
      }
      // Fallback signal: rare query words that appear in the description.
      // WHOLE WORD — `includes` scored "bench procedures" onto get_benchmarks
      // and beat the document search the operator actually asked for.
      const haystack = `${name.replace(/_/g, ' ')} ${tool.function.description}`.toLowerCase();
      for (const word of queryWords) if (hasWord(haystack, word)) score += 1;
    }
    // Recall before rank: an identifier in the turn text guarantees its
    // resolver a slot, whatever the keyword ranking said.
    for (const floor of RECALL_FLOOR) {
      if (floor.tool === name && floor.shape.test(queryText)) {
        score += RECALL_FLOOR_SCORE;
        break;
      }
    }
    if (mentioned.has(name)) score += RECALL_FLOOR_SCORE;
    if (score > 0) ranked.push({ tool, score });
  }

  ranked.sort((a, b) => b.score - a.score || a.tool.function.name.localeCompare(b.tool.function.name));

  const budget = Math.max(0, cap - mandatory.length);
  const picked = ranked.slice(0, budget);
  const subset = [...mandatory, ...picked.map((r) => r.tool)];
  return {
    tools: subset,
    mandatoryNames: mandatory.map((t) => t.function.name),
    rankedNames: picked.map((r) => r.tool.function.name),
  };
}

