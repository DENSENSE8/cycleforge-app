import { dailyCheckItemTitle } from '@/lib/daily-checks/composer';
import type { DailyCheckItem, DailyCheckItemKind, DailyCheckReport } from '@/lib/daily-checks/types';

/**
 * One Daily table row — a checklist item resolved against the day's report.
 *
 * A VIEW MODEL, assembled once from facts the report already carries, never
 * re-derived per cell (kinetic-ledger law 4: views assemble resolved facts).
 * The cells then render what is on the row and nothing else, which is what lets
 * the sort comparator read the same numbers the eye reads.
 */
export interface DailyTaskRow {
  id: number;
  /** Glyph-prefixed when the item carries one — one derivation, both faces. */
  title: string;
  sortOrder: number;
  /** Cadence: `once` is the exception that must not return tomorrow. */
  kind: DailyCheckItemKind;
  assignedStaffId: number | null;
  assignedStaffName: string | null;
  /** Did the VIEWER tick it — the `status` track. */
  done: boolean;
  /** How many responsible staff ticked it — the `team` numerator. */
  teamDone: number;
  /**
   * The item's denominator: the roster, or just the owner when the item is
   * owned. The report drops non-responsible marks, so `0/5` on an owned item
   * would be a fraction over a denominator nobody owes.
   */
  teamTotal: number;
  /** When the viewer ticked it (ISO), or null. */
  markedAt: string | null;
}

/**
 * Assemble the rows for one day.
 *
 * `teamDone` is counted across `report.staff` rather than read off a per-item
 * field because the report is staff-major: one pass here is cheaper and, more
 * to the point, keeps "how many people did this" defined in exactly one place
 * instead of once per consumer.
 */
export function buildDailyTaskRows(
  items: readonly DailyCheckItem[],
  report: DailyCheckReport | undefined,
  doneIds: ReadonlySet<number>,
  markedAtByItemId?: ReadonlyMap<number, string>,
): DailyTaskRow[] {
  const staff = report?.staff ?? [];
  const rosterSize = staff.length;

  const teamDoneByItem = new Map<number, number>();
  for (const person of staff) {
    for (const itemId of person.doneItemIds) {
      teamDoneByItem.set(itemId, (teamDoneByItem.get(itemId) ?? 0) + 1);
    }
  }

  return items.map((item) => ({
    id: item.id,
    title: dailyCheckItemTitle(item),
    sortOrder: item.sortOrder,
    kind: item.kind,
    assignedStaffId: item.assignedStaffId,
    assignedStaffName: item.assignedStaffName,
    done: doneIds.has(item.id),
    teamDone: teamDoneByItem.get(item.id) ?? 0,
    teamTotal: item.assignedStaffId != null ? 1 : rosterSize,
    markedAt: markedAtByItemId?.get(item.id) ?? null,
  }));
}
