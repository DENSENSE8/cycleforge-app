/** Task desk row → {@link CompoundRowView}. */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';
import {
  isTaskDeskOpen,
  taskDeskRecordLabel,
  taskDeskTitle,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';
import { workStatusLabel } from '@/lib/work-orders/work-status-display';

/** Whole days between now and a deadline; negative when still ahead of it. */
function daysPast(deadlineMs: number, nowMs: number): number {
  return Math.floor((nowMs - deadlineMs) / 86_400_000);
}

/** Lifecycle → the compound row's three-tone vocabulary. */
function taskStateTone(row: TaskDeskRow, nowMs: number): CompoundStateTone {
  if (row.status === 'DONE') return 'done';
  if (row.status === 'CANCELED') return 'neutral';
  if (row.deadlineAtMs != null && row.deadlineAtMs < nowMs) return 'alert';
  return 'neutral';
}

/** The handoff line: */
function handoffNote(row: TaskDeskRow): string | null {
  const to = row.assignee?.name?.trim();
  const from = row.assignedBy?.name?.trim();
  if (to && from) return `${to} · from ${from}`;
  if (to) return to;
  if (from) return `from ${from}`;
  return null;
}

export interface TaskDeskCompoundParts {
  /** The SAME clock the rest of the table read — never `Date.now()` per row. */
  nowMs: number;
}

export function taskDeskCompoundView(
  row: TaskDeskRow,
  parts: TaskDeskCompoundParts,
): CompoundRowView {
  // Only a task ABOUT an order has an order handle. Borrowing `entityId` for a
  // carton or a ticket would paint a real order number belonging to somebody
  // else — the same wrong-record bug `throw-targets` exists to prevent.
  const orderId = row.entityType === 'order' ? String(row.entityId) : null;

  // "Is this behind, and by how much" — the question the compound row's delay
  // track exists to answer. A finished task is not late, however long it took.
  const overdueBy =
    row.deadlineAtMs != null && isTaskDeskOpen(row.status)
      ? daysPast(row.deadlineAtMs, parts.nowMs)
      : null;

  return {
    id: String(row.id),
    // A task has no photo. The typed placeholder keeps the track's geometry so
    // Tasks and Unbox still line up scanline for scanline.
    thumbUrl: null,
    title: taskDeskTitle(row),
    // The TITLE column's second line is what somebody wrote about this row;
    // for a handoff that is who it went to and who sent it.
    note: handoffNote(row),
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    identityFace: compoundIdentityFace(row.id, 'Task id'),
    orderId,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: workStatusLabel(row.status) ?? row.status,
    stateTone: taskStateTone(row, parts.nowMs),
    stateTip:
      row.urgency === 'urgent' && isTaskDeskOpen(row.status)
        ? ['Urgent', taskDeskRecordLabel(row)].filter(Boolean).join(' · ')
        : taskDeskRecordLabel(row) ?? undefined,
    // A handoff is not worth money. An empty cell, never a `$0.00`.
    amount: null,
    delay: overdueBy == null ? null : { days: overdueBy, overdue: overdueBy > 0 },
    delayTip:
      row.deadlineAtMs != null
        ? `Due ${new Date(row.deadlineAtMs).toLocaleString()}`
        : undefined,
  };
}
