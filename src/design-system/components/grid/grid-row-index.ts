import type { RowGroup } from '@/lib/group-rows';

/**
 * Absolute ARIA row numbering for virtualized ledger grids.
 *
 * `aria-rowindex` / `aria-rowcount` exist precisely because a virtualized table
 * has only a window of its rows in the DOM: without them a screen reader
 * announces "row 3 of 30" when the user is really on row 403 of 1,200.
 *
 * Sheet list bodies render **flat leaves** (no in-grid summary row). Indices
 * match what the group renderers emit: one row per leaf, plus optional day-band
 * headers. Parent rollups live only on the drill parent map and are outside
 * this table's row count.
 *
 * Row budget per item:
 *  • day band header  → 1 row
 *  • group            → `rows.length` leaf rows
 *  • flat row         → 1 row
 */

/** The column header occupies row 1; body numbering starts at 2. */
export const GRID_HEADER_ROW_INDEX = 1;

/** Rows a group contributes — one leaf per member (no summary chrome). */
export function groupRowSpan<T>(group: RowGroup<T>): number {
  return group.rows.length;
}

interface CountGridRowsArgs<T> {
  orderGroupsByDate?: [string, RowGroup<T>[]][];
  daySections?: [string, T[]][];
  /** Day bands each occupy a row of their own when shown. */
  showDayHeaders?: boolean;
}

/**
 * Total rows in the table INCLUDING the column header — the `aria-rowcount`
 * value. Counts every leaf the grid shows (flat sheet contract).
 */
export function countGridRows<T>({
  orderGroupsByDate,
  daySections,
  showDayHeaders = false,
}: CountGridRowsArgs<T>): number {
  let total = GRID_HEADER_ROW_INDEX;

  if (orderGroupsByDate) {
    for (const [, groups] of orderGroupsByDate) {
      if (showDayHeaders) total += 1;
      for (const group of groups) total += groupRowSpan(group);
    }
    return total;
  }

  if (daySections) {
    for (const [, rows] of daySections) {
      if (showDayHeaders) total += 1;
      total += rows.length;
    }
  }

  return total;
}

/**
 * Does this grid have any DATA to show — chrome (column header, day bands)
 * excluded?
 *
 * The empty question and the `aria-rowcount` question are different, and
 * conflating them is how `LedgerGrid` used to answer it: it tested
 * `orderGroupsByDate?.length === 0`, i.e. **how many BANDS were passed**, not
 * how many rows those bands held. A surface that always emits one band — the
 * natural shape for a flat, un-banded list (`[['', groups]]`) — therefore read
 * as non-empty with zero rows, and rendered its column headers over a void
 * instead of the teaching box. `/pickup` shipped that way; the warranty grid
 * hit it the day it was written.
 *
 * `countGridRows` cannot answer this on its own: it starts at
 * {@link GRID_HEADER_ROW_INDEX} and adds a row per day band, so its floor moves
 * with the chrome. This counts leaves only.
 */
export function hasGridRows<T>({
  orderGroupsByDate,
  daySections,
}: Omit<CountGridRowsArgs<T>, 'showDayHeaders'>): boolean {
  if (orderGroupsByDate) {
    return orderGroupsByDate.some(([, groups]) => groups.some((g) => g.rows.length > 0));
  }
  if (daySections) {
    return daySections.some(([, rows]) => rows.length > 0);
  }
  return false;
}
