/**
 * Pure row comparator for the Daily Checks LedgerGrid column sorts.
 *
 * Sibling of `@/lib/staff-todos/tasks-grid-compare`, extracted for the same
 * reason: the extractor was inlined in `HomeDailyMode`, and `DailyTableTile`
 * needed the identical order without importing a page component into a tile.
 * One module, both mounts, no drift.
 *
 * Ties fall through to the checklist's authored order (`sortOrder`) and then to
 * `id` — the org wrote that order and it is a real fact, not insertion noise.
 */

import { compareGridValues } from '@/lib/grid/grid-column-sort';
import type { GridSortDir } from '@/lib/grid/grid-sort-dir';
import {
  DAILY_GRID_COLUMNS,
  type DailyGridColumnKey,
} from '@/lib/daily-checks/daily-grid-layout';
import type { DailyTaskRow } from '@/lib/home/daily-task-row';

/**
 * The sortable value behind one column.
 *
 * `status` is the STATE as 0/1, which keeps Open above Done under `asc`
 * regardless of how the label is spelled. `team` is a RATIO rather than a count
 * so a 3-person station and a 30-person one sort against the same scale.
 */
export function dailyCheckSortValue(
  row: DailyTaskRow,
  key: DailyGridColumnKey,
): string | number | null {
  switch (key) {
    case 'task':
      return row.title;
    case 'status':
      return row.done ? 1 : 0;
    case 'team':
      return row.teamTotal > 0 ? row.teamDone / row.teamTotal : null;
    case 'marked':
      return row.markedAt ? Date.parse(row.markedAt) : null;
    default:
      return null;
  }
}

/** The order a checklist takes with NO column sort — as the org authored it. */
export function compareDailyCheckRowsUnsorted(a: DailyTaskRow, b: DailyTaskRow): number {
  return a.sortOrder - b.sortOrder || a.id - b.id;
}

/**
 * Compare two daily-check rows under one column sort.
 *
 * `compareGridValues` has ALREADY applied `dir`, so the tiebreak must not be
 * re-signed — doing that re-inverts blanks and undoes the blanks-last ruling.
 */
export function compareDailyCheckRows(
  a: DailyTaskRow,
  b: DailyTaskRow,
  key: DailyGridColumnKey,
  dir: GridSortDir,
): number {
  const type = DAILY_GRID_COLUMNS.find((c) => c.key === key)?.type;
  const primary = compareGridValues(dailyCheckSortValue(a, key), dailyCheckSortValue(b, key), {
    type,
    dir,
  });
  return primary !== 0 ? primary : a.sortOrder - b.sortOrder || a.id - b.id;
}
