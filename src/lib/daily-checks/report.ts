/**
 * Daily checklist read model — marks + roster + list → one day's report.
 *
 * PURE: no React, no fetch, no DB. The route hands it three arrays and gets the
 * shape the surface renders, so the report can be unit-tested with zero DB and
 * the view never assembles facts itself.
 *
 * The load-bearing decision here is that the roster is an INPUT, not something
 * derived from the marks. Deriving it would make a staffer who checked nothing
 * invisible — and "who has not done their checks yet" is the single most useful
 * question this report answers. Honest absence: they appear with 0 / N.
 */

import type {
  DailyCheckItem,
  DailyCheckMarkFact,
  DailyCheckReport,
  DailyCheckStaffMember,
  DailyCheckStaffRow,
} from './types';

/** Inputs for {@link buildDailyCheckReport}. Module-local: no consumer names it. */
interface BuildDailyCheckReportInput {
  /** Warehouse civil day, `YYYY-MM-DD`. */
  dateKey: string;
  /** Items in effect on `dateKey`, already ordered by sort_order. */
  items: DailyCheckItem[];
  /** Every mark recorded on `dateKey`. Order is irrelevant. */
  marks: DailyCheckMarkFact[];
  /** Everyone expected to run the list that day. */
  roster: DailyCheckStaffMember[];
  /** Who is looking — gets `report.mine` even if off the roster. */
  viewerStaffId: number | null;
  /** Display name for the viewer when they are not on the roster. */
  viewerName?: string | null;
}

function emptyRow(staffId: number, name: string, total: number): DailyCheckStaffRow {
  return { staffId, name, doneItemIds: [], doneCount: 0, total, lastMarkedAt: null };
}

export function buildDailyCheckReport(input: BuildDailyCheckReportInput): DailyCheckReport {
  const { dateKey, items, marks, roster, viewerStaffId, viewerName } = input;
  const total = items.length;

  // Item order is the report's order everywhere, so index once and reuse it
  // rather than sorting each staffer's ticks separately.
  const itemRank = new Map<number, number>();
  items.forEach((item, i) => itemRank.set(item.id, i));

  const byStaff = new Map<number, DailyCheckStaffRow>();
  for (const member of roster) {
    byStaff.set(member.staffId, emptyRow(member.staffId, member.name, total));
  }

  for (const mark of marks) {
    // A mark against an item that was NOT in effect that day is dropped, not
    // counted: it would push doneCount past `total` and render as "7 of 6".
    // Reachable when an item is retired mid-day.
    if (!itemRank.has(mark.itemId)) continue;

    let row = byStaff.get(mark.staffId);
    if (!row) {
      // Marked, but off the roster — someone who left, or a role change since.
      // Their work still counts; the report would otherwise silently lose it.
      row = emptyRow(mark.staffId, `Staff #${mark.staffId}`, total);
      byStaff.set(mark.staffId, row);
    }

    // The unique index makes a duplicate (item, staff, day) impossible in the
    // DB, but this builder also serves optimistic client state, where one can
    // appear for a frame.
    if (!row.doneItemIds.includes(mark.itemId)) {
      row.doneItemIds.push(mark.itemId);
      row.doneCount += 1;
    }
    if (row.lastMarkedAt == null || mark.markedAt > row.lastMarkedAt) {
      row.lastMarkedAt = mark.markedAt;
    }
  }

  for (const row of byStaff.values()) {
    row.doneItemIds.sort((a, b) => (itemRank.get(a) ?? 0) - (itemRank.get(b) ?? 0));
  }

  // Least-done first: the report is read to find who still owes checks, so the
  // rows that need action lead. Name breaks the tie for a stable order.
  const staff = [...byStaff.values()].sort(
    (a, b) => a.doneCount - b.doneCount || a.name.localeCompare(b.name),
  );

  const mine =
    (viewerStaffId != null ? byStaff.get(viewerStaffId) : undefined) ??
    emptyRow(viewerStaffId ?? 0, viewerName ?? 'You', total);

  return {
    dateKey,
    items,
    staff,
    mine,
    totalDone: staff.reduce((sum, row) => sum + row.doneCount, 0),
    totalPossible: total * staff.length,
  };
}
