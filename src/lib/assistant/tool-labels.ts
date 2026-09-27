/**
 * Plain-language names for tools, for everything the OPERATOR reads.
 *
 * Two voices, one file:
 *  - {@link toolLabel} — the NOUN a result is filed under ("Product locations",
 *    "Bin contents"). The inline result's heading and the side panel's meta
 *    line use it instead of a tool id.
 *  - {@link toolActivityLabel} / {@link toolDoneLabel} — the live line while a
 *    step runs ("Checking bin C-03-12-3…") and the same step once it is done
 *    ("Checked bin C-03-12-3"), for the thinking line and the "Thought process"
 *    trace. A tool the argument-aware map does not know falls back to its
 *    `TOOL_ACTIVITY_PHRASES` participle (`tool-activity.ts`), so no id ever
 *    reaches the screen.
 *
 * Lookups are own-property only: `name` is whatever the model emitted.
 */

import { TOOL_ACTIVITY_PHRASES, toolActivityPhrase, toolDonePhrase } from './tool-activity';

/** Tool id → the noun its result is shown under. */
const TOOL_LABELS: Readonly<Record<string, string>> = {
  locate_product: 'Product locations',
  list_location_contents: 'Bin contents',
  get_packing_kpi: 'Packing pace',
  list_support_followups: 'Follow-ups',
  get_packing_performance: 'Packing performance',
  get_unbox_backlog: 'Unbox backlog',
  get_order_value_rank: 'Orders by value',
  get_roi_rank: 'Top gaps',
  get_delegation_plan: 'Delegation plan',
  triage_orders_csv: 'Order import check',
  hybrid_entity_search: 'Search results',
  get_operations_journey: 'Timeline',
  resolve_support_ticket: 'Support ticket',
  draft_ticket_reply: 'Reply draft',
  read_staff_document: 'Document',
  get_order_documents: 'Order documents',
  link_manual_to_sku: 'Manual link',
  render_artifact: 'Result',
};

/** A value typed by the operator, trimmed to fit one line of the thinking row. */
function inputValue(input: unknown, key: string): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = Object.hasOwn(input, key) ? (input as Record<string, unknown>)[key] : undefined;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

/**
 * Argument-aware lines: tool id → (input) → [live, done], or null to fall back
 * to the generic phrase. The live line carries no "…" — the callers add it.
 */
const ACTIVITY_LINES: Readonly<Record<string, (input: unknown) => readonly [string, string] | null>> = {
  locate_product: (input) => {
    const q = inputValue(input, 'query');
    return q ? [`Searching locations for ${q}`, `Searched locations for ${q}`] : ['Searching locations', 'Searched locations'];
  },
  list_location_contents: (input) => {
    const bin = inputValue(input, 'location');
    return bin ? [`Checking bin ${bin}`, `Checked bin ${bin}`] : ['Checking the bin', 'Checked the bin'];
  },
  link_manual_to_sku: (input) => {
    const sku = inputValue(input, 'sku');
    return sku ? [`Linking the manual to SKU ${sku}`, `Manual link for SKU ${sku}`] : null;
  },
  get_order_documents: (input) => {
    const order = inputValue(input, 'order');
    return order
      ? [`Finding documents for order ${order}`, `Found documents for order ${order}`]
      : ['Finding order documents', 'Found order documents'];
  },
};

/** The noun a tool's result is filed under — never the id. */
export function toolLabel(name: string): string {
  if (Object.hasOwn(TOOL_LABELS, name)) return TOOL_LABELS[name];
  // An unmapped tool: its activity phrase minus the leading verb ("Reading the
  // packing KPIs" → "The packing KPIs") still reads as a noun, never an id.
  const phrase = toolActivityPhrase(name);
  const rest = phrase.replace(/^\S+\s+/, '').replace(/^the\s+/i, '');
  const noun = rest && rest !== phrase ? rest : phrase;
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

/** The live line while a tool runs, "…" included: "Checking bin C-03-12-3…". */
export function toolActivityLabel(name: string, input?: unknown): string {
  const line = Object.hasOwn(ACTIVITY_LINES, name) ? ACTIVITY_LINES[name](input) : null;
  return `${line ? line[0] : toolActivityPhrase(name)}…`;
}

/**
 * Model-written text (its reasoning, a narration note) with every KNOWN tool
 * id swapped for its plain name: "use locate_product" → "use product
 * locations". Only registered ids are touched — never a guess at other text.
 */
export function humanizeToolNames(text: string): string {
  return text.replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, (id) =>
    Object.hasOwn(TOOL_LABELS, id) || Object.hasOwn(TOOL_ACTIVITY_PHRASES, id) ? toolLabel(id).toLowerCase() : id,
  );
}

/** The same step once it finished, sentence case: "Checked bin C-03-12-3". */
export function toolDoneLabel(name: string, input?: unknown): string {
  const line = Object.hasOwn(ACTIVITY_LINES, name) ? ACTIVITY_LINES[name](input) : null;
  const done = line ? line[1] : toolDonePhrase(name);
  return done.charAt(0).toUpperCase() + done.slice(1);
}
