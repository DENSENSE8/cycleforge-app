/**
 * Tasks slot resolvers — row + fieldId → the resolved fact a slot cell paints.
 * Pure functions; no React, no hooks.
 *
 * Vocabularies are never declared here: the done/open face resolves through
 * `workStatusLabel` and the station through `STATION_LABEL`, the same SoTs the
 * compound state pill and note line already read.
 *
 * Note what is NOT here: lateness. Whether a recurring task is behind depends
 * on the clock, and the surface passes ONE `nowMs` to every row for exactly
 * that reason — a per-row `Date.now()` would let two rows in one paint disagree
 * about what day it is. The compound state cell already reports it from that
 * shared clock, so a bound "overdue" column would be a second author of one
 * fact with a worse clock.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { STATION_LABEL, type StationKey } from '@/components/layout/goal-chip/goal-chip-shared';
import type { StaffTaskRow } from '@/features/tasks/grid/staff-task-row';
import type { TaskRow } from '@/lib/ops-plans/types';
import { workStatusLabel } from '@/lib/work-orders/work-status-display';
import { formatDateKeyShort } from '@/utils/date';

/** Epoch ms → the civil-day face every other date slot paints. */
function dayText(ms: number | null): string | null {
  return ms == null ? null : formatDateKeyShort(new Date(ms).toISOString().slice(0, 10));
}

function isStaffTaskRow(row: StaffTaskRow | TaskRow): row is StaffTaskRow {
  return typeof row.id === 'number';
}

function planTaskStatusText(row: TaskRow): string {
  if (row.status === 'in_progress') return workStatusLabel('IN_PROGRESS') ?? 'Active';
  if (row.status === 'done') return workStatusLabel('DONE') ?? 'Done';
  if (row.status === 'canceled') return workStatusLabel('CANCELED') ?? 'Canceled';
  return workStatusLabel('OPEN') ?? 'Open';
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveTasksSlotValue(
  row: StaffTaskRow | TaskRow,
  fieldId: string,
): CompoundSlotValue | null {
  if (!isStaffTaskRow(row)) {
    switch (fieldId) {
      case 'tasks.task':
        return { kind: 'value', text: row.title };
      case 'tasks.status':
        return { kind: 'value', text: planTaskStatusText(row) };
      case 'tasks.kind':
        return { kind: 'value', text: null };
      case 'tasks.station': {
        const raw = (row.station || '').trim();
        if (!raw) return { kind: 'value', text: null };
        return { kind: 'value', text: STATION_LABEL[raw as StationKey] ?? raw };
      }
      case 'tasks.resets':
        return { kind: 'value', text: null };
      case 'tasks.checked':
        return { kind: 'value', text: dayText(row.completedAt ? Date.parse(row.completedAt) : null) };
      case 'tasks.project':
        return { kind: 'value', text: row.planTitle || null };
      case 'tasks.assignee':
        return { kind: 'value', text: row.assigneeName };
      case 'tasks.due':
        return { kind: 'value', text: dayText(row.dueAt ? Date.parse(row.dueAt) : null) };
      default:
        return null;
    }
  }
  switch (fieldId) {
    case 'tasks.task':
      return { kind: 'value', text: `#${row.id}` };
    case 'tasks.status':
      return {
        kind: 'value',
        text: row.archived
          ? 'Deleted'
          : (workStatusLabel(row.done ? 'DONE' : 'OPEN') ?? (row.done ? 'Done' : 'Open')),
      };
    case 'tasks.kind':
      return { kind: 'value', text: row.kind === 'recurring' ? 'Recurring' : 'General' };
    case 'tasks.station': {
      const raw = (row.station || '').trim();
      if (!raw) return { kind: 'value', text: null };
      return { kind: 'value', text: STATION_LABEL[raw as StationKey] ?? raw };
    }
    case 'tasks.resets':
      // A general task has no cycle, so it has nothing to reset — a dash, not
      // an invented date.
      return { kind: 'value', text: dayText(row.resetsAtMs) };
    case 'tasks.checked':
      return { kind: 'value', text: dayText(row.checkedAtMs) };
    case 'tasks.project':
    case 'tasks.assignee':
    case 'tasks.due':
      return { kind: 'value', text: null };
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
  row: StaffTaskRow | TaskRow,
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
