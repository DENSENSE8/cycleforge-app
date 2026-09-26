/** Order compare model — what two selected orders disagree about. */

import { toPSTDateKey } from '@/utils/date';

/**
 * How a fact is READ, not how it is painted. The view maps kind → presentation
 * (mono for `id`, `tabular-nums` for `qty` / `date`, …); the model uses it only
 * to pick the comparison rule.
 */
type CompareFactKind = 'id' | 'text' | 'condition' | 'platform' | 'date' | 'qty';

/** The row fields the compare pane reads. */
export interface OrderCompareRow {
  id?: number | string | null;
  order_id?: string | null;
  product_title?: string | null;
  item_name?: string | null;
  sku?: string | null;
  item_number?: string | null;
  condition?: string | null;
  quantity?: string | number | null;
  serial_number?: string | null;
  shipping_tracking_number?: string | null;
  tracking_number?: string | null;
  account_source?: string | null;
  ship_by_date?: string | null;
  deadline_at?: string | null;
}

interface OrderCompareFact {
  key: string;
  label: string;
  kind: CompareFactKind;
  /** Raw left value, or `null` when the row has no answer. Views render `null`
   *  as the house em dash (`GridCellDash`) — never blank, never `"N/A"`. */
  left: string | null;
  right: string | null;
  /** The two sides say different things — including present vs absent. */
  diverges: boolean;
  /** NEITHER side has it. Equal, but there is nothing to read. */
  bothMissing: boolean;
}

interface OrderCompareResult {
  facts: OrderCompareFact[];
  /** Facts that differ — the pane's headline and the "differences only" count. */
  divergentCount: number;
  /** Facts either row can answer (`bothMissing` excluded), the honest
   *  denominator for "3 of 8 differ". Counting all of them would quietly
   *  inflate agreement with fields no lane populates. */
  comparableCount: number;
}

type FactReader = (row: OrderCompareRow) => unknown;

interface FactDescriptor {
  key: string;
  label: string;
  kind: CompareFactKind;
  read: FactReader;
}

/** First non-blank of several candidate fields — the two row shapes spell some
 *  facts differently, and a compare that read only one spelling would report a
 *  divergence between two lanes rather than between two orders. */
function firstOf(...values: unknown[]): unknown {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    return v;
  }
  return null;
}

/**
 * The fact stack, in read order: identity first (is this even the same job?),
 * then the facts that actually diverge in practice — condition, serial,
 * tracking, ship-by.
 */
const FACTS: FactDescriptor[] = [
  { key: 'order_id', label: 'Order', kind: 'id', read: (r) => r.order_id },
  {
    key: 'product_title',
    label: 'Product',
    kind: 'text',
    read: (r) => firstOf(r.product_title, r.item_name),
  },
  { key: 'sku', label: 'SKU', kind: 'id', read: (r) => r.sku },
  { key: 'item_number', label: 'Item #', kind: 'id', read: (r) => r.item_number },
  { key: 'condition', label: 'Condition', kind: 'condition', read: (r) => r.condition },
  { key: 'quantity', label: 'Qty', kind: 'qty', read: (r) => r.quantity },
  { key: 'serial_number', label: 'Serial', kind: 'id', read: (r) => r.serial_number },
  {
    key: 'tracking',
    label: 'Tracking',
    kind: 'id',
    read: (r) => firstOf(r.shipping_tracking_number, r.tracking_number),
  },
  { key: 'account_source', label: 'Platform', kind: 'platform', read: (r) => r.account_source },
  {
    key: 'ship_by',
    label: 'Ship by',
    kind: 'date',
    read: (r) => firstOf(r.ship_by_date, r.deadline_at),
  },
];

/** Raw → the string the view shows, or `null` for honest absence. */
function readRaw(row: OrderCompareRow, descriptor: FactDescriptor): string | null {
  const value = descriptor.read(row);
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  // Legacy sentinels that mean "no value" in these tables. Rendering them as
  // real values would report a divergence between a blank and a placeholder.
  if (text === '-' || text === '--' || text === '---') return null;
  return text;
}

/** Case- and whitespace-insensitive, because none of these facts are
 *  case-bearing and the sources disagree about spacing. */
function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Multi-value identifier (`"A, B"`) → an order-independent key. Two orders
 * carrying the same serials in a different join order are the same fact.
 */
function normalizeIdList(value: string): string {
  const parts = value
    .split(/[,;]/)
    .map((p) => normalizeText(p))
    .filter(Boolean);
  if (parts.length <= 1) return normalizeText(value);
  return [...parts].sort().join(',');
}

/** The comparison key for a fact. `null` in ⇒ `null` out, so absence stays
 *  distinguishable from the empty string all the way to the verdict. */
function comparisonKey(value: string | null, kind: CompareFactKind): string | null {
  if (value === null) return null;
  if (kind === 'date') {
    // Civil day via the date SoT: a `timestamptz` and a `YYYY-MM-DD` naming the
    // same warehouse day must compare equal. Falls back to plain text when the
    // value is not a parseable date at all, so a junk string still compares.
    const key = toPSTDateKey(value);
    return key || normalizeText(value);
  }
  if (kind === 'qty') {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : normalizeText(value);
  }
  if (kind === 'id') return normalizeIdList(value);
  return normalizeText(value);
}

/**
 * Build the fact-by-fact comparison of two orders.
 *
 * Left/right follow SELECTION order (`resolveRailOccupancy` preserves it), never
 * id order — the columns must not swap sides under the operator mid-read.
 */
export function buildOrderCompare(
  left: OrderCompareRow,
  right: OrderCompareRow,
): OrderCompareResult {
  const facts: OrderCompareFact[] = FACTS.map((descriptor) => {
    const leftRaw = readRaw(left, descriptor);
    const rightRaw = readRaw(right, descriptor);
    const bothMissing = leftRaw === null && rightRaw === null;
    const leftKey = comparisonKey(leftRaw, descriptor.kind);
    const rightKey = comparisonKey(rightRaw, descriptor.kind);
    return {
      key: descriptor.key,
      label: descriptor.label,
      kind: descriptor.kind,
      left: leftRaw,
      right: rightRaw,
      // Absent on both is agreement, not a finding. Absent on ONE is the
      // finding the pane exists to surface.
      diverges: !bothMissing && leftKey !== rightKey,
      bothMissing,
    };
  });

  return {
    facts,
    divergentCount: facts.filter((f) => f.diverges).length,
    comparableCount: facts.filter((f) => !f.bothMissing).length,
  };
}
