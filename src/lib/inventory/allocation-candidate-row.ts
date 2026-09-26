/** One ALLOCATION CANDIDATE — an order that has a SKU, is not shipped, and has no open `order_unit_allocations` row, beside how many… */

/** Raw shape as `tenantQuery` returns it — timestamps arrive as `Date`. */
export interface AllocationCandidateQueryRow {
  order_id: number;
  order_id_text: string | null;
  sku: string;
  condition: string | null;
  /** `orders.quantity` is TEXT. Parsed by {@link candidateQty}, never trusted raw. */
  quantity_str: string | null;
  available_stocked: number;
  order_date: Date | string | null;
  created_at: Date | string | null;
}

/** The RSC → client island row: ISO strings, no `Date` across the boundary. */
export interface AllocationCandidateRow {
  order_id: number;
  order_id_text: string | null;
  sku: string;
  condition: string | null;
  quantity_str: string | null;
  available_stocked: number;
  order_date: string | null;
  created_at: string | null;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const s = value.trim();
  if (!s) return null;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function toAllocationCandidateRow(
  raw: AllocationCandidateQueryRow,
): AllocationCandidateRow {
  return {
    order_id: raw.order_id,
    order_id_text: raw.order_id_text,
    sku: raw.sku,
    condition: raw.condition,
    quantity_str: raw.quantity_str,
    available_stocked: raw.available_stocked,
    order_date: isoOrNull(raw.order_date),
    created_at: isoOrNull(raw.created_at),
  };
}

/**
 * How many units this order needs. Verbatim from the retired page: a blank,
 * non-numeric or fractional `orders.quantity` still means at least one unit.
 */
export function candidateQty(row: Pick<AllocationCandidateRow, 'quantity_str'>): number {
  return Math.max(1, Math.floor(Number(row.quantity_str ?? '1') || 1));
}

/** Units still missing before this order can be allocated. `0` ⇒ allocatable. */
export function candidateShortfall(
  row: Pick<AllocationCandidateRow, 'quantity_str' | 'available_stocked'>,
): number {
  return Math.max(0, candidateQty(row) - row.available_stocked);
}

export function isCandidateAllocatable(
  row: Pick<AllocationCandidateRow, 'quantity_str' | 'available_stocked'>,
): boolean {
  return candidateShortfall(row) === 0;
}

/** The state pill's CLOSED vocabulary — the fact the retired tri-colour cell carried in ink. */
export const CANDIDATE_STATE_READY = 'Ready' as const;
export const CANDIDATE_STATE_SHORT = 'Short' as const;
export const CANDIDATE_STATE_NO_STOCK = 'No stock' as const;

export type CandidateStateWord =
  | typeof CANDIDATE_STATE_READY
  | typeof CANDIDATE_STATE_SHORT
  | typeof CANDIDATE_STATE_NO_STOCK;

export function candidateStateWord(
  row: Pick<AllocationCandidateRow, 'quantity_str' | 'available_stocked'>,
): CandidateStateWord {
  if (isCandidateAllocatable(row)) return CANDIDATE_STATE_READY;
  return row.available_stocked > 0 ? CANDIDATE_STATE_SHORT : CANDIDATE_STATE_NO_STOCK;
}

/** The shortfall in words — the retired disabled button's `HoverTooltip` copy, to the unit. */
export function candidateShortfallSentence(
  row: Pick<AllocationCandidateRow, 'quantity_str' | 'available_stocked'>,
): string | null {
  if (isCandidateAllocatable(row)) return null;
  return `Need ${candidateQty(row)} stocked, only ${row.available_stocked} available`;
}
