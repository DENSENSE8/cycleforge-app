/**
 * Project task row → {@link CompoundRowView}. Pure; no React, no hooks.
 *
 * Home → Tasks paints `ops_plan_tasks` on the shared compound tracks. Identity
 * is the task title; the note line carries project + assignee; STATUS is the
 * plan-task lifecycle. Due date rides the delay face so a late task is a delay
 * count, not a second clock.
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { workStatusLabel } from '@/lib/work-orders/work-status-display';
import type { OpsPlanTaskStatus } from '@/lib/ops-plans/constants';
import type { TaskRow } from '@/lib/ops-plans/types';

function daysPast(deadlineMs: number, nowMs: number): number {
  return Math.floor((nowMs - deadlineMs) / 86_400_000);
}

function stateLabel(status: OpsPlanTaskStatus): string {
  if (status === 'in_progress') return workStatusLabel('IN_PROGRESS') ?? 'Active';
  if (status === 'done') return workStatusLabel('DONE') ?? 'Done';
  if (status === 'canceled') return workStatusLabel('CANCELED') ?? 'Canceled';
  return workStatusLabel('OPEN') ?? 'Open';
}

function stateTone(status: OpsPlanTaskStatus): CompoundStateTone {
  if (status === 'done') return 'done';
  return 'neutral';
}

export function projectTaskCompoundView(
  row: TaskRow,
  parts: { nowMs: number },
): CompoundRowView {
  const dueMs = row.dueAt ? Date.parse(row.dueAt) : NaN;
  const overdueBy =
    Number.isFinite(dueMs) && row.status !== 'done' && row.status !== 'canceled'
      ? daysPast(dueMs, parts.nowMs)
      : null;
  const note = [row.planTitle, row.assigneeName].filter(Boolean).join(' · ') || null;

  return {
    id: row.id,
    thumbUrl: null,
    title: row.title,
    note,
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: stateLabel(row.status),
    stateTone: stateTone(row.status),
    stateTip:
      row.status === 'canceled'
        ? 'Canceled'
        : row.status === 'done'
          ? 'Done'
          : row.assigneeName
            ? `Assigned to ${row.assigneeName}`
            : 'Unassigned',
    amount: null,
    delay: overdueBy == null ? null : { days: overdueBy, overdue: overdueBy > 0 },
    delayTip: row.dueAt ? `Due ${new Date(row.dueAt).toLocaleString()}` : undefined,
  };
}
