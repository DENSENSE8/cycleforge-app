/**
 * Daily checklist — the "reset all" patch, as a pure function.
 *
 * Reset is the operator's end-of-shift eraser: it clears MY ticks for one civil
 * day and nobody else's. That is a report-shaped edit, not a row-shaped one —
 * `mine`, the matching roster row, and `totalDone` are three views of the same
 * fact, so patching one without the others makes the checklist and the report
 * below it disagree.
 *
 * It lives outside `use-daily-checks.ts` so it can be tested without React
 * Query, and outside `report.ts` because it edits a report rather than
 * assembling one.
 */

import type { DailyCheckReport, DailyCheckStaffRow } from './types';

const clearRow = (row: DailyCheckStaffRow): DailyCheckStaffRow => ({
  ...row,
  doneItemIds: [],
  doneCount: 0,
  lastMarkedAt: null,
  // The per-task instants go with the ticks. Leaving them would tell the
  // manager report a task was completed at 09:14 that now shows unchecked.
  markedAtByItemId: {},
});

/**
 * The viewer's day with their own ticks removed. Immutable — returns a new
 * report; the caller's copy is untouched so a failed request can roll back to it.
 *
 * `totalDone` is the ALL-STAFF numerator, so it drops by exactly the viewer's
 * count. Clamped at zero: a stale cache must never render a negative headline.
 */
export function clearMineFromReport(report: DailyCheckReport): DailyCheckReport {
  const cleared = report.mine.doneCount;
  return {
    ...report,
    mine: clearRow(report.mine),
    staff: report.staff.map((row) =>
      row.staffId === report.mine.staffId ? clearRow(row) : row,
    ),
    totalDone: Math.max(0, report.totalDone - cleared),
  };
}
