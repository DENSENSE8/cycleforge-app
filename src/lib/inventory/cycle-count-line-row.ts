/**
 * The cycle-count LINE row — the wire shape
 * `/inventory/cycle-counts/[id]` hands its client table island, and the
 * row the `cycle-count-lines` family speaks about.
 *
 * The desk is an RSC page: `loadLines` runs server-side (the `?status=` filter
 * is a SQL predicate, not a client narrow) and the rows cross the boundary as
 * props, so this shape is deliberately PLAIN and serializable — ISO strings,
 * no `Date`, no pg row object. Same contract as its parent,
 * `cycle-count-campaign-row.ts`.
 *
 * ## Two fields that are NOT columns of `cycle_count_lines`
 *
 * `varianceTol` / `overTolerance` and `campaignOpen` are CAMPAIGN facts,
 * threaded into each line by the page that already loaded the campaign. They
 * are here because the two things that read them cannot reach page state:
 *
 * - the row ADAPTER is `row → CompoundRowView` and may not read a closure, so
 *   the retired variance cell's tolerance-dependent colour had nowhere to come
 *   from. It is now {@link isCycleCountLineOverTolerance}, computed once where
 *   the row is built, and the adapter says it in the state PILL's word instead
 *   of colouring a number (tone is not a fact).
 * - a row VERB's precondition is a predicate over ROW STATE, never over the
 *   route or the mount (`VERBS_BIND_TO_FIELDS`). "Counting is closed" is a
 *   campaign fact the line must be able to answer for itself.
 *
 * ## Not here, and deliberately
 *
 * `notes` is selected by `loadLines` and painted by NOTHING — there was never
 * a notes cell, a notes tooltip or a notes row expansion on this desk. A fact
 * nothing paints is not a catalog entry and does not cross the boundary; the
 * day a line-note plane ships it mints its own field. `cycle-count-lines.test.ts`
 * fails the day `notes` appears in a catalog `paths` without one.
 */

/** The five-way closed vocabulary of `cycle_count_lines.status`. */
export const CYCLE_COUNT_LINE_STATUSES = [
  'pending',
  'counted',
  'pending_review',
  'approved',
  'rejected',
] as const;

export type CycleCountLineStatus = (typeof CYCLE_COUNT_LINE_STATUSES)[number];

export interface CycleCountLineRow {
  id: number;
  /** The campaign this line belongs to — the server actions' FormData key. */
  campaignId: number;
  binId: number;
  /** `locations.name`; `null` ⇒ the identity face falls back to `#binId`. */
  binName: string | null;
  sku: string;
  expectedQty: number;
  /** `null` until somebody counts. */
  countedQty: number | null;
  /** `counted_qty - expected_qty`, as stored. `null` until counted. */
  variance: number | null;
  status: string;
  /** `cycle_count_lines.counted_by` — drives the PERSON face's avatar. */
  countedByStaffId: number | null;
  countedByName: string | null;
  /** ISO instant — the Dates chrome Hash line. */
  countedAt: string | null;
  approvedByStaffId: number | null;
  approvedByName: string | null;
  /** ISO instant — the Dates chrome Calendar line. */
  approvedAt: string | null;
  /** The CAMPAIGN's tolerance as stored (`0.050`) — the gate, as a fact. */
  varianceTol: string;
  /** Derived: this line's variance is outside {@link varianceTol}. */
  overTolerance: boolean;
  /** The CAMPAIGN is still open ⇒ the row's write verbs are offered. */
  campaignOpen: boolean;
}

/**
 * The line's IDENTITY face — `bin_name ?? #bin_id`, exactly what the retired
 * `bin` cell printed. One implementation, read by the resolver (the identity
 * chip, the header's sort key and the search index) and by the count plane's
 * subtitle: a second face on either side would order the desk by words the
 * operator cannot see.
 */
export function cycleCountLineBinLabel(
  row: Pick<CycleCountLineRow, 'binId' | 'binName'>,
): string {
  const name = (row.binName ?? '').trim();
  return name || `#${row.binId}`;
}

/**
 * The line's state PILL word. The retired pill printed the raw enum
 * (`pending_review`); the underscore is a storage detail, so the one closed
 * vocabulary is spelled here and read by the adapter (the pill) and the
 * resolver (the Status header's sort key and the search index).
 */
export function cycleCountLineStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'counted':
      return 'Counted';
    case 'pending_review':
      return 'Pending review';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    default:
      return status.trim();
  }
}

/**
 * The signed variance FACE — `+3`, `-2`, `0`. The retired cell printed the
 * sign for positives only, and the sign is the whole point of the column: a
 * bare `3` beside a bare `2` does not say which way the bin is wrong.
 *
 * `null` (never counted) resolves to null text, which the cell paints as the
 * meta dash — never a `0` that would read as "counted, and correct".
 */
export function cycleCountLineVarianceFace(variance: number | null): string | null {
  if (variance == null) return null;
  return variance > 0 ? `+${variance}` : String(variance);
}

/**
 * Is this line's variance outside the campaign's tolerance?
 *
 * The retired cell's condition, verbatim: a non-zero variance whose magnitude
 * exceeds `expected_qty × variance_tol`. It lived inside a `className`
 * ternary, which is why it could read the campaign — this is the same
 * arithmetic where the row is BUILT, so the fact travels with the line and the
 * adapter never reaches for page state.
 *
 * A zero (or absent) variance is never out of tolerance, and a tolerance that
 * does not parse gates nothing rather than flagging every row.
 */
export function isCycleCountLineOverTolerance(
  variance: number | null,
  expectedQty: number,
  varianceTol: string | number,
): boolean {
  if (variance == null || variance === 0) return false;
  const tol = Number(varianceTol);
  if (!Number.isFinite(tol)) return false;
  return Math.abs(variance) > expectedQty * tol;
}
