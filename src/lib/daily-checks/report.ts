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
  return {
    staffId,
    name,
    doneItemIds: [],
    doneCount: 0,
    total,
    lastMarkedAt: null,
    markedAtByItemId: {},
  };
}

export function buildDailyCheckReport(input: BuildDailyCheckReportInput): DailyCheckReport {
  const { dateKey, items, marks, roster, viewerStaffId, viewerName } = input;

  // Item order is the report's order everywhere, so index once and reuse it
  // rather than sorting each staffer's ticks separately.
  const itemRank = new Map<number, number>();
  items.forEach((item, i) => itemRank.set(item.id, i));
  const itemById = new Map(items.map((item) => [item.id, item]));

  /**
   * Recurring work always belongs to the shift. One-offs are shift-wide when
   * unowned and personal only when explicitly assigned.
   */
  const countsFor = (item: DailyCheckItem, staffId: number): boolean =>
    item.kind === 'recurring' || item.assignedStaffId == null || item.assignedStaffId === staffId;

  const totalFor = (staffId: number): number =>
    items.reduce((sum, item) => (countsFor(item, staffId) ? sum + 1 : sum), 0);

  const byStaff = new Map<number, DailyCheckStaffRow>();
  for (const member of roster) {
    byStaff.set(member.staffId, emptyRow(member.staffId, member.name, totalFor(member.staffId)));
  }

  for (const mark of marks) {
    // A mark against an item that was NOT in effect that day is dropped, not
    // counted: it would push doneCount past `total` and render as "7 of 6".
    // Reachable when an item is retired mid-day.
    if (!itemRank.has(mark.itemId)) continue;

    // A mark by a staffer the item does not count for is dropped the SAME way:
    // an owned one-off ticked by someone covering the desk is a real gesture,
    // but counting it would inflate a denominator it was never in.
    if (!countsFor(itemById.get(mark.itemId)!, mark.staffId)) continue;

    let row = byStaff.get(mark.staffId);
    if (!row) {
      // Marked, but off the roster — someone who left, or a role change since.
      // Their work still counts; the report would otherwise silently lose it.
      row = emptyRow(mark.staffId, `Staff #${mark.staffId}`, totalFor(mark.staffId));
      byStaff.set(mark.staffId, row);
    }

    // The unique index makes a duplicate (item, staff, day) impossible in the
    // DB, but this builder also serves optimistic client state, where one can
    // appear for a frame.
    if (!row.doneItemIds.includes(mark.itemId)) {
      row.doneItemIds.push(mark.itemId);
      row.doneCount += 1;
    }
    // WHEN, per task — the manager report reads a shift task by task, so the
    // instant is kept beside the tick instead of being collapsed into
    // `lastMarkedAt`. Earliest wins on a duplicate: the first attestation is
    // the one that happened; an optimistic re-render must not move a time the
    // operator already saw.
    const seen = row.markedAtByItemId[mark.itemId];
    if (seen == null || mark.markedAt < seen) {
      (row.markedAtByItemId as Record<number, string>)[mark.itemId] = mark.markedAt;
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

  const fallbackViewerId = viewerStaffId ?? 0;
  const mine =
    (viewerStaffId != null ? byStaff.get(viewerStaffId) : undefined) ??
    emptyRow(fallbackViewerId, viewerName ?? 'You', totalFor(fallbackViewerId));

  return {
    dateKey,
    items,
    staff,
    mine,
    totalDone: staff.reduce((sum, row) => sum + row.doneCount, 0),
    // Per-staff denominators are no longer interchangeable, so the day's
    // ceiling is the SUM of everyone's own list — not list × roster.
    totalPossible: staff.reduce((sum, row) => sum + row.total, 0),
  };
}
