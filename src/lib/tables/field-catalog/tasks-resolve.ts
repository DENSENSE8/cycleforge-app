/**
 * Tasks slot resolvers — row + fieldId → the resolved fact a slot cell paints.
 * Pure functions; no React, no hooks.
 *
 * Vocabularies are never declared here: the lifecycle face resolves through
 * `workStatusLabel` (the same SoT the compound state pill and the work-order
 * chip read) and the record noun through `taskDeskRecordLabel`. A string
 * literal in this file would be a second spelling of a word another surface
 * already owns.
 *
 * Note what is NOT here: lateness. Whether a task is past its deadline depends
 * on the clock, and the surface passes ONE `nowMs` to every row for exactly
 * that reason — a per-row `Date.now()` would let two rows in one paint
 * disagree about what day it is. The compound state cell already reports it
 * from that shared clock, so a bound "overdue" column would be a second author
 * of one fact with a worse clock.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { taskDeskRecordLabel, type TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { workStatusLabel } from '@/lib/work-orders/work-status-display';
import { formatDateKeyShort } from '@/utils/date';

/** Epoch ms → the civil-day face every other date slot paints. */
function dayText(ms: number | null): string | null {
  return ms == null ? null : formatDateKeyShort(new Date(ms).toISOString().slice(0, 10));
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveTasksSlotValue(
  row: TaskDeskRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'tasks.task':
      return { kind: 'value', text: `#${row.id}` };
    case 'tasks.status':
      // `workStatusLabel` returns null for a label it does not know; every
      // `assignment_status_enum` value is in its table, so the fallback is
      // defensive rather than reachable.
      return { kind: 'value', text: workStatusLabel(row.status) ?? row.status };
    case 'tasks.priority':
      return { kind: 'value', text: row.urgency === 'urgent' ? 'Urgent' : 'Normal' };
    case 'tasks.assignee':
      return { kind: 'value', text: row.assignee?.name ?? null };
    case 'tasks.assignedBy':
      // NULL on every row written before `assigned_by_staff_id` existed
      // (2026-08-08d, deliberately never backfilled) — an honest dash.
      return { kind: 'value', text: row.assignedBy?.name ?? null };
    case 'tasks.start':
      return { kind: 'value', text: dayText(row.startedAtMs) };
    case 'tasks.deadline':
      return { kind: 'value', text: dayText(row.deadlineAtMs) };
    case 'tasks.completed':
      return { kind: 'value', text: dayText(row.completedAtMs) };
    case 'tasks.record':
      return { kind: 'value', text: taskDeskRecordLabel(row) };
    case 'tasks.ticket':
      // Only the SUPPORT_TICKET arm has one. A task about an order reads a
      // dash rather than borrowing its record handle as a ticket number.
      return {
        kind: 'value',
        text: row.ticket ? (row.ticket.subject?.trim() || `#${row.ticket.id}`) : null,
      };
    default:
      return null;
  }
}

/**
 * Every bound slot for one row, keyed by TRACK key — the `slots` half of the
 * shared `CompoundRowView`. Built from the MOUNTED model so a rebind re-points
 * the cell with no change here.
 */
export function tasksSlotValuesFor(
  row: TaskDeskRow,
  columns: readonly { key: string; fieldId?: string }[],
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId) continue;
    const value = resolveTasksSlotValue(row, col.fieldId);
    if (!value) continue;
    slots ??= {};
    slots[col.key] = value;
  }
  return slots;
}
