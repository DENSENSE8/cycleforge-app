/** Completed-tasks slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { taskDeskRecordLabel, type TaskDeskRow } from '@/lib/tasks/task-desk-row';
import type { TaskUrgency } from '@/lib/tasks/task-vocabulary';
import { workStatusLabel } from '@/lib/work-orders/work-status-display';

/**
 * The two urgency levels as an operator reads them. `TASK_PRIORITY` owns the
 * stored ints and `taskUrgencyFromPriority` owns the threshold; this is only
 * the word, and it is the word the product-wide urgent mark already uses.
 */
const URGENCY_LABEL: Readonly<Record<TaskUrgency, string>> = {
  urgent: 'Urgent',
  normal: 'Normal',
};

/*
 * Epoch ms → the ISO instant, inline at both date cases: the row already holds
 * the milliseconds, and a one-line wrapper would only hide `new Date(...)`.
 */

/**
 * `Ticket 77 · Label printer jammed` — the record, then its cached subject.
 * A ticket with no subject cache is named by the record phrase alone rather
 * than by an invented one.
 */
export function reportTasksRecordText(row: TaskDeskRow): string {
  const subject = row.ticket?.subject?.trim();
  const label = taskDeskRecordLabel(row);
  if (!label) return 'No linked record';
  return subject ? `${label} · ${subject}` : label;
}

export function resolveReportTasksSlotValue(
  row: TaskDeskRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'report-tasks.id':
      return { kind: 'value', text: String(row.id) };
    case 'report-tasks.note':
      return { kind: 'value', text: row.note || null };
    case 'report-tasks.record':
      return { kind: 'value', text: reportTasksRecordText(row) };
    case 'report-tasks.assignee':
      return {
        kind: 'person',
        staffId: row.assignee?.id ?? null,
        name: row.assignee?.name ?? null,
      };
    case 'report-tasks.assigned_by':
      return {
        kind: 'person',
        staffId: row.assignedBy?.id ?? null,
        name: row.assignedBy?.name ?? null,
      };
    case 'report-tasks.urgency':
      return { kind: 'value', text: URGENCY_LABEL[row.urgency] };
    case 'report-tasks.completed':
      return {
        kind: 'value',
        text: row.completedAtMs === null ? null : new Date(row.completedAtMs).toISOString(),
      };
    // A task nobody promised a day for resolves to null TEXT rather than to a
    // stand-in date: the engine's blank rule then sinks those rows under both
    // sort directions, which is where "no deadline" belongs on a due column.
    case 'report-tasks.deadline':
      return {
        kind: 'value',
        text: row.deadlineAtMs === null ? null : new Date(row.deadlineAtMs).toISOString(),
      };
    case 'report-tasks.status':
      return { kind: 'value', text: workStatusLabel(row.status) };
    default:
      return null;
  }
}
