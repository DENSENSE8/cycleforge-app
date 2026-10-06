/**
 * Suggested next questions under an assistant answer (plan §B.7).
 *
 * DETERMINISTIC: a per-tool template table fed by what the turn actually did —
 * the tools that ran (with their arguments) and the artifacts they painted.
 * Every suggestion names an entity this turn's data returned, so a chip is
 * always a question the registry can answer, never a guess. No model call.
 *
 * Pure: no I/O. The route emits the result as the `suggestions` frame after
 * `done` and persists it in `analysis.suggestions`.
 */

import type { AssistantMention } from './context-store';
import type { SessionArtifact } from './ui-artifacts';

export const FOLLOW_UPS_MAX = 3;
export const FOLLOW_UP_MAX_CHARS = 60;

/** The reconcile chip that opens a prefilled order draft (`reconcile-follow-through.ts`). */
export const RECONCILE_ADD_ORDERS_CHIP = 'Add the missing ones as new orders';

export interface FollowUpInput {
  /** The operator's message this turn — suggestions never repeat it. */
  question: string;
  /** Server tools that ran, in order, with the arguments the model passed. */
  tools: ReadonlyArray<{ name: string; input: unknown }>;
  /** Artifacts painted this turn; `producedBy` names the tool that built a report table. */
  artifacts: ReadonlyArray<{ artifact: SessionArtifact; producedBy?: string | null }>;
  mentions?: ReadonlyArray<AssistantMention> | null;
}

type Row = Record<string, string | number | boolean | null>;

function inputString(input: unknown, key: string): string | null {
  if (!input || typeof input !== 'object') return null;
  const v = (input as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function tableRows(
  artifacts: FollowUpInput['artifacts'],
  producedBy: string,
): Row[] {
  return artifacts.flatMap(({ artifact, producedBy: by }) =>
    by === producedBy && artifact.kind === 'table' ? (artifact.rows as Row[]) : [],
  );
}

/** Distinct non-empty string values of one column, in row order. */
function column(rows: Row[], key: string): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const v = row[key];
    const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Bins ordered by quantity held, largest first. */
function binsByQty(rows: Row[]): string[] {
  const ranked = rows
    .filter((r) => typeof r.Bin === 'string' && r.Bin)
    .sort((a, b) => (Number(b.Qty) || 0) - (Number(a.Qty) || 0));
  return column(ranked, 'Bin');
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function suggestFollowUps(input: FollowUpInput): string[] {
  const candidates: string[] = [];
  const toolNames = new Set(input.tools.map((t) => t.name));
  /** Entities this turn already answered for — never suggest asking again. */
  const listedBins = new Set(
    input.tools
      .filter((t) => t.name === 'list_location_contents')
      .map((t) => normalize(inputString(t.input, 'location') ?? '')),
  );
  const locatedSkus = new Set(
    input.tools
      .filter((t) => t.name === 'locate_product')
      .map((t) => normalize(inputString(t.input, 'query') ?? '')),
  );

  if (toolNames.has('locate_product')) {
    const rows = tableRows(input.artifacts, 'locate_product');
    const skus = column(rows, 'SKU');
    for (const bin of binsByQty(rows)) {
      if (!listedBins.has(normalize(bin))) candidates.push(`What else is in bin ${bin}?`);
    }
    if (skus.length === 1 && rows.length > 1) candidates.push(`How many ${skus[0]} do we have in total?`);
    if (rows.length === 0) {
      const query = input.tools.find((t) => t.name === 'locate_product' && inputString(t.input, 'query'));
      const q = query ? inputString(query.input, 'query') : null;
      if (q) candidates.push(`Search products matching ${q}`);
    }
  }

  if (toolNames.has('list_location_contents')) {
    const rows = tableRows(input.artifacts, 'list_location_contents');
    for (const sku of column(rows, 'SKU')) {
      if (!locatedSkus.has(normalize(sku))) candidates.push(`Where else is ${sku} stored?`);
    }
  }

  if (toolNames.has('get_packing_kpi')) {
    candidates.push('Who is packing fastest today?', 'How does today compare to yesterday?');
  }

  if (toolNames.has('list_support_followups')) {
    candidates.push('Which follow-up has waited longest?');
  }

  if (toolNames.has('reconcile_refs')) {
    const rows = tableRows(input.artifacts, 'reconcile_refs');
    const missing = rows.filter((r) => r.Group === 'Not in system');
    if (missing.length > 0) {
      candidates.push(RECONCILE_ADD_ORDERS_CHIP);
    }
    const owed = column(rows.filter((r) => r.Group === 'Not received'), 'Ref');
    if (owed[0]) candidates.push(`Tell me when ${owed[0]} arrives`);
  }

  if (toolNames.has('get_customer')) {
    for (const { artifact, producedBy } of input.artifacts) {
      if (producedBy !== 'get_customer' || artifact.kind !== 'record') continue;
      const order = artifact.fields.find((f) => f.label.startsWith('Order '))?.label.slice('Order '.length);
      if (order) candidates.push(`Where is the package for order ${order}?`);
      candidates.push(`New phone order for ${artifact.title}`);
    }
  }

  if (toolNames.has('get_worklist')) {
    const kinds = input.tools.filter((t) => t.name === 'get_worklist').map((t) => inputString(t.input, 'kind') ?? 'all');
    if (kinds.includes('all')) candidates.push('Show the late orders', 'Show the exceptions queue');
    else candidates.push('What should I do first?');
  }

  for (const t of input.tools) {
    if (t.name === 'lookup_serial') {
      const serial = inputString(t.input, 'serial');
      if (serial) candidates.push(`Is serial ${serial} under warranty?`);
    } else if (t.name === 'get_order_lookup') {
      const order = inputString(t.input, 'orderId');
      if (order) candidates.push(`Show the journey of order ${order}`);
    } else if (t.name === 'get_tracking_status') {
      const tracking = inputString(t.input, 'tracking');
      if (tracking) candidates.push(`Tell me when ${tracking} arrives`);
    }
  }

  // A mention nothing read yet: offer its reader.
  for (const m of input.mentions ?? []) {
    if (m.kind === 'bin' && !listedBins.has(normalize(m.id))) candidates.push(`What is in bin ${m.id}?`);
    else if (m.kind === 'sku' && !locatedSkus.has(normalize(m.id))) candidates.push(`Where is SKU ${m.id}?`);
  }

  const asked = normalize(input.question);
  const out: string[] = [];
  for (const c of candidates) {
    if (c.length > FOLLOW_UP_MAX_CHARS) continue;
    const key = normalize(c);
    if (key === asked || out.some((o) => normalize(o) === key)) continue;
    out.push(c);
    if (out.length === FOLLOW_UPS_MAX) break;
  }
  return out;
}
