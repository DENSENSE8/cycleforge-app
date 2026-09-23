/**
 * The two derived facts a phone task row paints — the record it is about, and
 * when it is owed.
 *
 * Pure and React-free so the row stays a presentational leaf and both answers
 * are unit-testable without a renderer. Nothing here decides *where* the row
 * links: that is {@link taskDeskRecordHref}, the one declaration both surfaces
 * read, so one task cannot point at two records.
 */

import { taskDeskRecordLabel, type TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { formatDateKeyShort, toPSTDateKey } from '@/utils/date';

/**
 * What the record READS as on a 390px row.
 *
 * A support ticket names itself — `subject_cache` is the only human string a
 * task carries, and "Ticket #812" next to a subject the operator can read is
 * the id winning an argument it should lose. Orders and cartons have no cached
 * title on the wire, so they print the handle, in the same vocabulary
 * `resolveThrowTargets` labels a scan with (`Carton 4471`) rather than a second
 * word for one object.
 */
export function taskRecordLabel(row: Pick<TaskDeskRow, 'entityType' | 'entityId' | 'ticket'>): string {
  if (row.entityType === 'support_ticket') {
    const subject = row.ticket?.subject?.trim();
    if (subject) return subject;
  }
  // Every handle face — including `Ticket 48120`, which is the PROVIDER
  // number, not the registry id nobody has ever quoted.
  return taskDeskRecordLabel(row);
}

export interface TaskDeadlineFact {
  /** The words on the row. */
  text: string;
  /** Past its instant — the row marks it, the list does not re-sort for it. */
  overdue: boolean;
}

/**
 * The deadline as an operator reads it.
 *
 * Two grains on purpose: OVERDUE is decided on the instant (a 5pm deadline is
 * not late at noon and is late at six), while the WORD is decided on the
 * warehouse day, because "Due Sep 24" is what a floor staffer plans against and
 * a timestamp is not. A task with no deadline returns `null` and the row prints
 * nothing — a dateless task is one nobody promised a day for, and inventing
 * "No deadline" would give it a fact it does not have.
 */
export function taskDeadlineFact(
  deadlineAtMs: number | null,
  nowMs: number,
): TaskDeadlineFact | null {
  if (deadlineAtMs == null || !Number.isFinite(deadlineAtMs)) return null;

  const dueKey = toPSTDateKey(new Date(deadlineAtMs));
  if (!dueKey) return null;

  const overdue = deadlineAtMs < nowMs;
  const todayKey = toPSTDateKey(new Date(nowMs));

  if (dueKey === todayKey) {
    return { text: overdue ? 'Overdue today' : 'Due today', overdue };
  }
  return { text: `${overdue ? 'Overdue' : 'Due'} ${formatDateKeyShort(dueKey)}`, overdue };
}
