/**
 * Task desk row → {@link CompoundRowView}. Pure; no React, no hooks.
 *
 * The `tasks` family's adapter into the single compound renderer. Where a task
 * has no equivalent fact the mapping says so with `null` rather than inventing
 * one — an assigned task has no photo and, unless it is about an order, no
 * order handle either. That difference is DATA; the layout around it is
 * identical to every other table's, which is the whole point.
 *
 * Replaced `staff-task-compound-view.ts` with the store swap (R-A,
 * 2026-09-22). The facts it mapped — kind, station, cycle reset — do not exist
 * on `work_assignments`, and the ones the operator asked for (assignee,
 * assigner, deadline, priority) did not exist on `staff_todos`.
 */

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

/**
 * Lifecycle → the compound row's three-tone vocabulary.
 *
 * `alert` is earned here, and only here: an open task past its deadline is
 * precisely "needs a human", which is what the tone means on every other
 * family. An open task that is merely open is not — a grid where every
 * unfinished row shouts has no signal left for the row that genuinely does.
 */
function taskStateTone(row: TaskDeskRow, nowMs: number): CompoundStateTone {
  if (row.status === 'DONE') return 'done';
  if (row.status === 'CANCELED') return 'neutral';
  if (row.deadlineAtMs != null && row.deadlineAtMs < nowMs) return 'alert';
  return 'neutral';
}

/**
 * The handoff line: who owes this, and who handed it over.
 *
 * `assigned_by_staff_id` is NULL on every row written before 2026-08-08d and
 * was deliberately never backfilled, so the "from" half is omitted rather than
 * printed as "from —" on historical rows.
 */
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
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
    identityFace: compoundIdentityFace(row.id, 'Task id'),
    orderId,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: workStatusLabel(row.status) ?? row.status,
    stateTone: taskStateTone(row, parts.nowMs),
    stateTip:
      row.urgency === 'urgent' && isTaskDeskOpen(row.status)
        ? `Urgent · ${taskDeskRecordLabel(row)}`
        : taskDeskRecordLabel(row),
    // A handoff is not worth money. An empty cell, never a `$0.00`.
    amount: null,
    delay: overdueBy == null ? null : { days: overdueBy, overdue: overdueBy > 0 },
    delayTip:
      row.deadlineAtMs != null
        ? `Due ${new Date(row.deadlineAtMs).toLocaleString()}`
        : undefined,
  };
}
