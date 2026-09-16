/**
 * Daily's row ORDER — pure, so the surface keeps only the mount.
 *
 * Two orders, and the distinction is the point:
 *
 * - **Unsorted** is the AUTHORED order (`sortOrder`), not insertion order. The
 *   org wrote the shift list in a sequence, and that sequence is a real fact
 *   about how the shift runs.
 * - **Sorted** goes through {@link compareGridValues}, the same comparator
 *   every slot-table family uses, so blanks land last and the direction is
 *   applied exactly once.
 *
 * `id` breaks every tie after `sortOrder`, so the order is total — a stable
 * sort over an unstable key is what makes rows swap places on an unrelated
 * refetch.
 */

import { compareGridValues } from '@/design-system/components/grid';
import {
  DAILY_SORT_FACT_TYPES,
  type DailySortFact,
} from '@/lib/daily-checks/daily-grid-layout';
import type { DailyTaskRow } from './daily-task-row';
import type { GridSortDir } from '@/design-system/components/grid';

/** The fact a sort reads off one row. `null` ⇒ blank, which sorts last. */
function sortValue(row: DailyTaskRow, fact: DailySortFact): string | number | null {
  switch (fact) {
    case 'task':
      return row.title;
    // Sort by the STATE, not the word: `done` as 0/1 keeps Open above Done
    // under asc without depending on how the label happens to be spelled.
    case 'status':
      return row.done ? 1 : 0;
    case 'team':
      return row.teamTotal > 0 ? row.teamDone / row.teamTotal : null;
    case 'marked':
      return row.markedAt ? Date.parse(row.markedAt) : null;
    // The owner's NAME is the face; null (unowned / recurring) is blank and
    // lands last under `compareGridValues`.
    case 'owner':
      return row.assignedStaffName;
    default:
      return null;
  }
}

/**
 * Authored order — the shift list first, today's one-offs under it, then
 * `sortOrder` and the `id` tiebreak so the order stays total.
 *
 * `recurring` leads because the attestation is the list's spine; a `once` item
 * is today's exception and reads best once the standing list is out of the
 * way. This rules the UNSORTED view, and it is also the sorted branches'
 * TIEBREAK — two rows equal on the sorted fact fall back to how the list
 * reads, so no explicit sort ever scatters one-offs back into the shift list.
 */
const byAuthoredOrder = (a: DailyTaskRow, b: DailyTaskRow) =>
  (a.kind === 'once' ? 1 : 0) - (b.kind === 'once' ? 1 : 0) ||
  a.sortOrder - b.sortOrder ||
  a.id - b.id;

export function sortDailyTaskRows(
  rows: readonly DailyTaskRow[],
  fact: DailySortFact | null,
  dir: GridSortDir | null,
): DailyTaskRow[] {
  if (!fact || !dir) return [...rows].sort(byAuthoredOrder);
  const type = DAILY_SORT_FACT_TYPES[fact];
  return [...rows].sort((a, b) => {
    const primary = compareGridValues(sortValue(a, fact), sortValue(b, fact), { type, dir });
    // `compareGridValues` already applied `dir`; re-signing here would
    // re-invert blanks and undo the blanks-last ruling.
    return primary !== 0 ? primary : byAuthoredOrder(a, b);
  });
}
