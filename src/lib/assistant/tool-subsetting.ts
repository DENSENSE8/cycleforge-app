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

/** Total advertisement budget for a self-hosted turn (core + UI + ranked). */
export const SELF_HOSTED_TOOL_CAP_DEFAULT = 10;

/** Server verbs every turn can reach for, whatever the question was. */
const ALWAYS_ON_CORE: Record<string, true> = {
  hybrid_entity_search: true,
  exact_id_serial_search: true,
};

/** The write chokepoint — subsetting it out would make write asks unanswerable. */
const ALWAYS_ON_WRITES: Record<string, true> = { propose_mutation: true };

/** Mandatory on every self-hosted turn: data answers land through it. */
const ALWAYS_ON_UI: Record<string, true> = { render_artifact: true };

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
  get_kpis: ['kpi', 'kpis', 'throughput', 'event counts', 'how many received', 'how many shipped'],
  search_notes: ['notes', 'buyer note', 'reason code', 'search reasons', 'tech notes'],
  get_mutation_history: ['what did you change', 'mutation history', 'your changes', 'what have you changed'],
  get_chat_history: ['chat history', 'previous conversations', 'past sessions', 'as we discussed', 'yesterday we'],
  resolve_support_ticket: ['support ticket', 'ticket scan', 'ticket number', 'the ticket'],
  get_operations_journey: ['what happened to', 'journey', 'full history', 'trace', 'timeline', 'cross-station'],
  get_order_lookup: ['order id', 'tracking number', 'look up order', 'specific order'],
  lookup_serial: ['serial return', 'shipped this serial', 'is this a return', 'return-intake', 'which order'],
  lookup_warranty_coverage: ['warranty', 'coverage', 'under warranty', 'when does the warranty'],
  list_warranty_claims: ['warranty claims', 'claims', 'claim status', 'open claims'],
  get_assignments: ['who is assigned', 'assignments', 'work orders', 'assigned to', 'test queue', 'repair queue'],
  get_my_tech_queue: ['my queue', 'my tech', 'my inbox', 'my cartons', 'my returns'],
  list_support_followups: ['follow-up', 'followups', 'follow-ups', 'support inbox'],
  search_photos: ['photos', 'photo', 'pictures', 'damage', 'media library'],
  get_receiving_by_tracking: ['which carton', 'receiving carton', 'carton for', 'receiving for this'],
  get_ticket_entities: ['zendesk', 'ticket entities', 'ticket link'],
  get_packing_kpi: ['packing pace', 'packer', 'packed most', 'packing kpi', 'are we on capacity', 'pack rate'],
  resolve_receiving_line_for_order: ['line for order', 'photos from order', 'move the photos', 'lines on'],
  list_receiving_line_photos: ['photos on the line', 'line photos', 'photos on this carton'],
  resolve_item_number: ['item number', 'create a rule', 'resolve product', 'asin', 'listing rule'],
  list_staff: ['staff', 'who works', 'teammate', 'staff id', 'staffers', 'named'],
  draft_ticket_reply: ['draft a reply', 'reply to the ticket', 'ticket reply', 'draft reply'],
  get_daily_checks: ['daily checks', 'checklist', 'checked in today', 'checks for'],
  get_my_day: ['my day', 'what should i work on', 'waiting on me', 'do next', 'anything for me'],
  get_project_tasks: ['project tasks', 'ops plan', 'plan tasks', 'project inbox', 'still open on'],
  triage_orders_csv: ['csv', 'import orders', 'pasted orders', 'triage this', 'pending orders spreadsheet'],
  list_connected_apps: ['connected apps', 'my apps', 'integrations', 'which apps'],
  connect_app: ['connect', 'sign in to', 'hook up'],
  search_staff_documents: ['google docs', 'my docs', 'search documents', 'handbook', 'document search'],
  read_staff_document: ['read the document', 'read the doc', 'document text', 'open the doc'],
  get_roi_gaps: ['roi', 'gaps', 'leaking', 'losing money', 'fix first', 'biggest gaps', 'where are we losing'],
  get_station_catalog: ['station catalog', 'parts list', 'blocks', 'composition', 'station builder'],
  search_tool_registry: ['tool forge', 'registry of tools', 'search the tool registry'],
  submit_approval_decision: ['approval', 'approve the request', 'decision on the request'],
  execute_build_sandbox: ['build sandbox', 'run the build', 'sandbox'],
  commit_to_git: ['commit', 'git', 'branch'],
  revert_mutation: ['undo', 'revert', 'undo that', 'revert it'],
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

export interface ToolSubsetQueryContext {
  page?: string | null;
  mode?: string | null;
  station?: string | null;
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

  const mandatory: OpenAiFunctionTool[] = [];
  const ranked: Array<{ tool: OpenAiFunctionTool; score: number }> = [];

  for (const tool of tools) {
    const name = tool.function.name;
    const isUi = !ALWAYS_ON_CORE[name] && !ALWAYS_ON_WRITES[name] && UI_NAMES[name] === true;
    if (ALWAYS_ON_CORE[name] || ALWAYS_ON_WRITES[name] || ALWAYS_ON_UI[name]) {
      mandatory.push(tool);
      continue;
    }
    let score = 0;
    if (isUi) {
      const keywords = UI_KEYWORDS[name] ?? [];
      if (keywords.some((k) => aliasRegex(k).test(queryText))) score += 10;
    } else {
      for (const alias of TOOL_ALIASES[name] ?? []) {
        if (aliasRegex(alias).test(queryText)) score += 10;
      }
      // Fallback signal: rare query words that appear in the description.
      const haystack = `${name.replace(/_/g, ' ')} ${tool.function.description}`.toLowerCase();
      for (const word of queryWords) if (haystack.includes(word)) score += 1;
    }
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

