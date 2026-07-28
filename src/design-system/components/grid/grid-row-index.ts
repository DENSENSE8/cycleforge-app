import type { RowGroup } from '@/lib/group-rows';

/**
 * Absolute ARIA row numbering for virtualized ledger grids.
 *
 * `aria-rowindex` / `aria-rowcount` exist precisely because a virtualized table
 * has only a window of its rows in the DOM: without them a screen reader
 * announces "row 3 of 30" when the user is really on row 403 of 1,200.
 *
 * **Indices are computed as if every fold were expanded, and never renumber.**
 * That is the ARIA-recommended behaviour, not a shortcut — WAI-ARIA on
 * `aria-rowindex`: when rows are hidden (by a filter, or by collapsing a node)
 * it is useful to keep the remaining rows' indices stable, as long as
 * `aria-rowcount` reflects the total, so the user does not lose their place.
 *
 * The practical payoff: collapsing a fold does NOT have to renumber the grid,
 * so this module never needs to know a fold's expanded state — which lives
 * inside `CollapsibleGroupRow` and is deliberately not lifted.
 *
 * Row budget per item (mirrors what the group renderers actually emit):
 *  • day band header  → 1 row
 *  • singleton group  → 1 row  (`QueueGroupRow` renders the leaf directly)
 *  • multi-row group  → 1 summary row + `rows.length` child rows
 *  • flat row         → 1 row
 */

/** The column header occupies row 1; body numbering starts at 2. */
export const GRID_HEADER_ROW_INDEX = 1;

/** Rows a single fold contributes: a singleton is just its leaf. */
export function groupRowSpan<T>(group: RowGroup<T>): number {
  return group.rows.length === 1 ? 1 : 1 + group.rows.length;
}

interface CountGridRowsArgs<T> {
  orderGroupsByDate?: [string, RowGroup<T>[]][];
  daySections?: [string, T[]][];
  /** Day bands each occupy a row of their own when shown. */
  showDayHeaders?: boolean;
}

/**
 * Total rows in the table INCLUDING the column header — the `aria-rowcount`
 * value. Counts every row the grid could show with all folds expanded, which is
 * what the stable-index contract above requires.
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
