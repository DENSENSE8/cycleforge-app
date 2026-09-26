/** The two derived facts a phone task row paints — the record it is about, and when it is owed. */

import { taskDeskRecordLabel, type TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { formatDateKeyShort, toPSTDateKey } from '@/utils/date';

/** What the record READS as on a 390px row. */
export function taskRecordLabel(row: Pick<TaskDeskRow, 'entityType' | 'entityId' | 'ticket'>): string | null {
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

/** The deadline as an operator reads it. */
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
