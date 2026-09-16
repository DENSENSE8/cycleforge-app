/**
 * One ALLOCATION CANDIDATE — an order that has a SKU, is not shipped, and has
 * no open `order_unit_allocations` row, beside how many STOCKED `serial_units`
 * exist for the same SKU right now.
 *
 * The wire row for `/inventory/bulk-allocate` and the home of its two
 * DERIVED values. Both are computed here rather than selected, because neither
 * is a column:
 *
 * - `qty` — the retired page parsed `orders.quantity` (a TEXT column) into a
 *   floor-clamped integer inside the page component
 *   (`Math.max(1, Math.floor(Number(...) || 1))`). That parse is the fact; the
 *   raw string is not. It stays exactly as it was, so a row that reads `2.5`
 *   or `''` still counts as it did before the port.
 * - `eligible` — `available_stocked >= qty`. The retired cell expressed it as
 *   a THREE-way tri-colour (green / amber / red) on the availability number,
 *   which is tone carrying a fact. It is now a closed WORD vocabulary
 *   ({@link candidateStateWord}) the state pill paints and the header sorts.
 *
 * A resolver cannot `paths:` at either of them — there is no row column to
 * name — so they are catalog facts WITHOUT paths, resolved through this
 * module. `admin-bulk-allocate.test.ts` fails the day one of them grows a
 * `paths` entry.
 *
 * `order_date` / `created_at` are the desk's ONE temporal fact, in that
 * preference order and named in the tooltip (the `ordersOrderedAt` rule: the
 * channel's purchase instant, falling back to the insert stamp, never fused).
 * They were added to the candidate query by the Wave-D port because the shared
 * compound skeleton mounts a DATES track and a painted track with no fact is
 * both a dead header (`SLOT_TABLE_PAINT_LAW.headerSort`) and a `--` line
 * (`SLOT_TABLE_PAINT_LAW.dates`). How long an order has sat unallocated is
 * also the first thing an operator triaging this list asks.
 */

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

/**
 * The state pill's CLOSED vocabulary — the fact the retired tri-colour cell
 * carried in ink. Three words for the three cases it distinguished: enough
 * stock, some stock but not enough, and none at all. The pill prints one of
 * these, the `state` header sorts by it, and the search box matches it; the
 * COUNT behind "Short" is a quantity, and quantities read as sentences
 * ({@link candidateShortfallSentence}), not as pill labels that drift per row.
 */
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

/**
 * The shortfall in words — the retired disabled button's `HoverTooltip` copy,
 * to the unit. `null` when the order is allocatable and there is no shortfall
 * to explain.
 *
 * It survives in TWO readable places: the state pill's hover (`stateTip`) and
 * the disabled Allocate verb's own label. Losing it was the real risk of
 * turning a disabled `<Button>` into a row verb — a greyed control that does
 * not say what is missing sends the operator to the SKU page to count.
 */
export function candidateShortfallSentence(
  row: Pick<AllocationCandidateRow, 'quantity_str' | 'available_stocked'>,
): string | null {
  if (isCandidateAllocatable(row)) return null;
  return `Need ${candidateQty(row)} stocked, only ${row.available_stocked} available`;
}
