import { dailyCheckItemTitle } from '@/lib/daily-checks/composer';
import type { DailyCheckItem, DailyCheckItemKind, DailyCheckReport } from '@/lib/daily-checks/types';

/** One Daily table row — a checklist item resolved against the day's report. */
interface DailyTaskRow {
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
   * The item's denominator: the roster for recurring and unowned one-off work;
   * only an assigned one-off narrows it to one staffer.
   */
  teamTotal: number;
  /** When the viewer ticked it (ISO), or null. */
  markedAt: string | null;
  /** Item context, shown on the evidence column — never on one day's tick. */
  description: string | null;
  /** First linked Zendesk ticket (provider number), or null. */
  ticketId: number | null;
  /** Civil due time `HH:MM` (warehouse zone), or null. */
  dueTime: string | null;
  /** Minutes before {@link dueTime} the phone apps ring; null = no reminder. */
  remindOffsetMinutes: number | null;
}

/** Assemble the rows for one day. */
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
    teamTotal: item.kind === 'once' && item.assignedStaffId != null ? 1 : rosterSize,
    markedAt: markedAtByItemId?.get(item.id) ?? null,
    description: item.description,
    ticketId: item.ticketId,
    dueTime: item.dueTime,
    remindOffsetMinutes: item.remindOffsetMinutes,
  }));
}
