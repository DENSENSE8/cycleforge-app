/**
 * Staff-day report rows — the desk wire shape for "who did what, when".
 *
 * The phone (`/m/reports`) reads a staffer at a time from `buildStaffDay`;
 * the desk reads the WHOLE day at once, so the same projection is flattened
 * to LONG format — one row per (staffer × task). One shape per surface would
 * be two truths; this file exists so both surfaces read ONE projection and
 * differ only in presentation.
 *
 * LONG, not wide (staff × item matrix): a matrix column per task breaks the
 * moment the list changes — today's grid is tomorrow's ragged spreadsheet —
 * and the engine's search/sort already answers "show me Ana" and "everything
 * not checked" over long rows. The roster's authored task order survives as
 * `order`, so an unsorted desk still reads the day in the sequence the org
 * wrote it.
 */

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
