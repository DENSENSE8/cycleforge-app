/** Staff-day report rows — the desk wire shape for "who did what, when". */

import { buildStaffDays } from '@/lib/daily-checks/staff-day';
import type { DailyCheckReport } from '@/lib/daily-checks/types';

/** One (staffer × task) cell of one day's report. */
export interface StaffDayReportRow {
  /** Sort key: staffer's position in the report's roster order (least done first). */
  order: number;
  staffId: number;
  staffName: string;
  itemId: number;
  title: string;
  kind: 'recurring' | 'once';
  ticketId: number | null;
  /** ISO instant this staffer ticked it, or null when they never did. */
  checkedAt: string | null;
}

/** Flatten one day's report into desk rows. Pure; empty roster → empty rows. */
export function staffDayRowsFromReport(report: DailyCheckReport): StaffDayReportRow[] {
  return buildStaffDays(report).flatMap((day, staffIndex) =>
    day.tasks.map((task) => ({
      order: staffIndex,
      staffId: day.staffId,
      staffName: day.name,
      itemId: task.itemId,
      title: task.title,
      kind: task.kind,
      ticketId: task.ticketId,
      checkedAt: task.checkedAt,
    })),
  );
}
