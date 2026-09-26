import type { RowGroup } from '@/lib/group-rows';

/** Absolute ARIA row numbering for virtualized ledger grids. */

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
  /** Band key → SECTION label; a named band always occupies a row of its own. */
  sectionHeaders?: Record<string, string>;
}

/**
 * Total rows in the table INCLUDING the column header — the `aria-rowcount`
 * value. Counts every leaf the grid shows (flat sheet contract).
 */
export function countGridRows<T>({
  orderGroupsByDate,
  daySections,
  showDayHeaders = false,
  sectionHeaders,
}: CountGridRowsArgs<T>): number {
  let total = GRID_HEADER_ROW_INDEX;
  // A named SECTION band emits a header row of its own even when day banding is off, so it counts here too — `VirtualGroupedSections`…
  const bandHeaderRows = (key: string) =>
    showDayHeaders || sectionHeaders?.[key] !== undefined ? 1 : 0;

  if (orderGroupsByDate) {
    for (const [key, groups] of orderGroupsByDate) {
      total += bandHeaderRows(key);
      for (const group of groups) total += groupRowSpan(group);
    }
    return total;
  }

  if (daySections) {
    for (const [key, rows] of daySections) {
      total += bandHeaderRows(key);
      total += rows.length;
    }
  }

  return total;
}

/** Does this grid have any DATA to show — chrome (column header, day bands) excluded? */
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
