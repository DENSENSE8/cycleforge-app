/**
 * One staffer's day, task by task — the read model behind the manager report.
 *
 * The end this serves, in the operator's words (2026-09-15): *"the manager
 * would be able to look at all the daily reports via a certain day and have
 * things available like the staff member checked off this checklist at this
 * time, completed this task at this time."*
 *
 * PURE, like {@link buildDailyCheckReport} beside it: no React, no fetch, no
 * DB. It is a PROJECTION of the report the API already assembles — `items`
 * crossed with one staffer's `markedAtByItemId` — so the phone report, the desk
 * table and any export read one model and cannot disagree about what a shift
 * did. A second query for this would be a second truth.
 *
 * It needs no new endpoint. `GET /api/daily-checks?date=` already returns
 * everything below; `markedAtByItemId` was populated in DC4 for exactly this
 * and has had no consumer until now.
 *
 * ## What it deliberately does NOT do
 *
 * - **No filtering to "done".** A day is read to find what was MISSED, so an
 *   unchecked row is the point, not an absence. `checkedAt: null` is honest;
 *   dropping the row would make a blank day look like a perfect one.
 * - **No per-staff denominator maths.** `DailyCheckStaffRow.total` already
 *   carries it (owned one-offs count only for their owner). Re-deriving it here
 *   is how two surfaces start reporting different fractions.
 * - **No timezone work.** Instants are ISO and stay ISO; the surface formats
 *   them with `formatDateTimePST`. A civil day already arrived on `report.dateKey`.
 */

import type { DailyCheckReport, DailyCheckStaffRow } from './types';

/** One task on one staffer's day. */
export interface StaffDayTask {
  itemId: number;
  title: string;
  /**
   * Cadence, carried through so a reader can tell a standing shift check from
   * a one-off that only existed that day.
   */
  kind: 'recurring' | 'once';
  /** The linked helpdesk ticket, or null on a plain task. */
  ticketId: number | null;
  /**
   * Whose task it was, when it belonged to someone. Null = the whole shift.
   * A manager reading a miss needs to know whether it was anyone's job.
   */
  assignedStaffName: string | null;
  /** ISO instant this staffer ticked it, or null when they never did. */
  checkedAt: string | null;
}

/** One staffer's whole day, ready to render. */
export interface StaffDay {
  /** Warehouse civil day, `YYYY-MM-DD`. */
  dateKey: string;
  staffId: number;
  name: string;
  /** Checked / owed, straight from the report's per-staff denominator. */
  doneCount: number;
  total: number;
  /** Newest mark instant, or null when they checked nothing. */
  lastMarkedAt: string | null;
  /**
   * Checked tasks first in the order they were TICKED, then everything still
   * owed in the list's authored order.
   *
   * Two orders, because the list answers two questions and they are read at
   * different times: "walk me through the shift" is chronological, and it can
   * only be chronological for what actually happened; "what is still open" is
   * the tail, and it keeps the sequence the org wrote the list in, which is the
   * order the floor works it.
   */
  tasks: StaffDayTask[];
}

/**
 * The same obligation rule as the report: recurring work is shift-wide; only
 * a one-off can be private to one staffer.
 */
function owedBy(
  item: DailyCheckReport['items'][number],
  staffId: number,
): boolean {
  return item.kind === 'recurring' || item.assignedStaffId == null || item.assignedStaffId === staffId;
}

/**
 * Project one staffer out of a day's report.
 *
 * Returns `null` when that staffer has no row in the report — an honest "we
 * have nothing for this person on this day", which a surface renders as an
 * empty state rather than a fabricated zero.
 */
export function buildStaffDay(report: DailyCheckReport, staffId: number): StaffDay | null {
  const row: DailyCheckStaffRow | undefined =
    report.staff.find((s) => s.staffId === staffId) ??
    (report.mine.staffId === staffId ? report.mine : undefined);
  if (!row) return null;

  const checked: StaffDayTask[] = [];
  const owed: StaffDayTask[] = [];

  for (const item of report.items) {
    if (!owedBy(item, staffId)) continue;
    const checkedAt = row.markedAtByItemId[item.id] ?? null;
    const task: StaffDayTask = {
      itemId: item.id,
      title: item.title,
      kind: item.kind,
      ticketId: item.ticketId,
      assignedStaffName: item.assignedStaffName,
      checkedAt,
    };
    (checkedAt != null ? checked : owed).push(task);
  }

  // `report.items` already arrives in authored order, so `owed` is in it
  // untouched and only the checked half needs sorting.
  checked.sort((a, b) => (a.checkedAt ?? '').localeCompare(b.checkedAt ?? ''));

  return {
    dateKey: report.dateKey,
    staffId: row.staffId,
    name: row.name,
    doneCount: row.doneCount,
    total: row.total,
    lastMarkedAt: row.lastMarkedAt,
    tasks: [...checked, ...owed],
  };
}

/**
 * Every staffer's day, in the report's own order (least done first — the report
 * is read to find who still owes checks). The roster is the report's, so a
 * staffer who ticked nothing is present with an all-null day rather than
 * missing from the manager's screen.
 */
export function buildStaffDays(report: DailyCheckReport): StaffDay[] {
  return report.staff
    .map((s) => buildStaffDay(report, s.staffId))
    .filter((d): d is StaffDay => d !== null);
}
