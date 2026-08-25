/**
 * Pure row comparator for the Staff Tasks LedgerGrid column sorts.
 *
 * Twin of `@/lib/receiving/receiving-grid-compare` and
 * `@/components/dashboard/orders-queue/queue-row-compare`. Tasks and Daily were
 * the two families that never got one: their sort-value extractor was inlined
 * in `TasksWorkbench`, and when `TasksTableTile` needed the same order it grew
 * a second copy rather than import a page component into a tile. Two copies of
 * a comparator drift, and a grid that sorts one way on the route and another
 * way in a pane is the kind of difference nobody reports and everybody
 * distrusts — so the extractor lives here and both mounts read it.
 *
 * Ties fall through to the staffer's authored order (`sortOrder`) and then to
 * `id`, which is what makes the sort stable across re-fetches.
 */

import { compareGridValues } from '@/lib/grid/grid-column-sort';
import type { GridSortDir } from '@/lib/grid/grid-sort-dir';
import {
  TASKS_GRID_COLUMNS,
  type TasksGridColumnKey,
} from '@/lib/staff-todos/tasks-grid-layout';
import type { StaffTaskRow } from '@/lib/tasks/staff-task-row';

/**
 * The sortable value behind one column.
 *
 * `status` returns the STATE as a rank rather than the rendered word: sorting
 * on the label would make the order depend on how "Done" happens to be spelled,
 * and would put Archived between them on any relabel.
 */
export function staffTaskSortValue(
  row: StaffTaskRow,
  key: TasksGridColumnKey,
): string | number | null {
  switch (key) {
    case 'task':
      return row.text;
    case 'status':
      return row.archived ? 2 : row.done ? 1 : 0;
    case 'kind':
      return row.kind;
    case 'station':
      return row.station;
    case 'due':
      return row.resetsAtMs;
    case 'updated':
      return row.checkedAtMs;
    default:
      return null;
  }
}

/** The order a task list takes with NO column sort — as the staffer authored it. */
export function compareStaffTaskRowsUnsorted(a: StaffTaskRow, b: StaffTaskRow): number {
  return a.station.localeCompare(b.station) || a.sortOrder - b.sortOrder || a.id - b.id;
}

/**
 * Compare two task rows under one column sort.
 *
 * `compareGridValues` has ALREADY applied `dir`, so the tiebreak must not be
 * re-signed — doing that re-inverts blanks and undoes the blanks-last ruling.
 */
export function compareStaffTaskRows(
  a: StaffTaskRow,
  b: StaffTaskRow,
  key: TasksGridColumnKey,
  dir: GridSortDir,
): number {
  const type = TASKS_GRID_COLUMNS.find((c) => c.key === key)?.type;
  const primary = compareGridValues(staffTaskSortValue(a, key), staffTaskSortValue(b, key), {
    type,
    dir,
  });
  return primary !== 0 ? primary : a.sortOrder - b.sortOrder || a.id - b.id;
}
