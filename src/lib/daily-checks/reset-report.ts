/** Daily checklist — the "reset all" patch, as a pure function. */

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

/** The viewer's day with their own ticks removed. */
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
