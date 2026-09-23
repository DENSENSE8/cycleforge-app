'use client';

/**
 * The task desk's record plane — the picked task's detail, as a NON-MODAL
 * right-rail occupant.
 *
 * ## Why a rail and not a dialog
 *
 * A task is a pointer at a record, so reading it is almost always the first
 * half of *going and looking at the thing*. A modal takes the grid away while
 * you decide; the rail keeps the queue on screen and lets the operator step
 * down the list with the detail open. `RightRailHost` renders the top
 * occupant, which is why no surface hand-rolls its own `fixed right-0` panel.
 *
 * ## The paired ticket renders HERE, not as a link
 *
 * When the task is about a SUPPORT_TICKET the rail embeds
 * {@link SupportTicketDetail} in its dense `embedded` mode — the same renderer
 * the scan stations mount. The operator asked to *"pair a ticket to it"* and
 * see it beside the task; a link out to `/support` would lose the task, the
 * queue and the scroll position to read two sentences.
 *
 * ## One occupant id, never one per row
 *
 * {@link TASK_INSPECTOR_RAIL_ID} is stable, so stepping from task to task
 * REPLACES the body instead of stacking a second rail behind the first. That
 * is also why the body re-seeds its drafts on `row.id`: the component
 * instance survives a row step.
 */

import { useRouter } from 'next/navigation';
import { Loader2 } from '@/components/Icons';
import { DateTimeValue } from '@/design-system/components/DateTimeValue';
import { LedgerValue } from '@/design-system/components/LedgerValue';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { Button, Panel } from '@/design-system/primitives';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { PaneHeaderLabel } from '@/components/ui/pane-header';
import { useRegisterRightPanel } from '@/components/right-rail/useRegisterRightPanel';
import { RIGHT_RAIL_PRIORITY } from '@/lib/right-rail/store';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { workStatusChipClass, workStatusLabel } from '@/lib/work-orders/work-status-display';
import { TASK_PRIORITY } from '@/lib/tasks/task-vocabulary';
import {
  isTaskDeskOpen,
  taskDeskRecordHref,
  taskDeskRecordLabel,
  taskDeskTicketNumber,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';
import { cn } from '@/utils/_cn';
import { TASK_INSPECTOR_RAIL_ID } from './grid/task-inspector-id';
import type { TaskDeskPatch } from './useTaskDesk';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{label}</p>
      {children}
    </div>
  );
}

function Chip({ label, toneClass }: { label: string; toneClass: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
        toneClass,
      )}
    >
      {label}
    </span>
  );
}

function TaskInspectorBody({
  row,
  nowMs,
  pending,
  onPatch,
  onClose,
}: {
  row: TaskDeskRow;
  nowMs: number;
  pending: boolean;
  onPatch: (id: number, patch: TaskDeskPatch) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const open = isTaskDeskOpen(row.status);
  const overdue = open && row.deadlineAtMs != null && row.deadlineAtMs < nowMs;
  const recordHref = taskDeskRecordHref(row, 'desk');
  /**
   * The helpdesk number, never `entityId`. `SupportTicketDetail` reads
   * `/api/zendesk/tickets/[id]`, which proxies the provider API verbatim,
   * while `entityId` is the local registry id the task row joins on.
   */
  const ticketNumber = taskDeskTicketNumber(row);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="task-inspector">
      <DeskRailChromeRow onClose={onClose} />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        <PaneHeaderLabel
          eyebrow={taskDeskRecordLabel(row)}
          value={row.note || taskDeskRecordLabel(row)}
          valueTitle={row.note || taskDeskRecordLabel(row)}
        />

        <div className="flex flex-wrap gap-2">
          <Chip
            label={workStatusLabel(row.status) ?? row.status}
            toneClass={workStatusChipClass(row.status)}
          />
          {row.urgency === 'urgent' ? (
            <Chip label="Urgent" toneClass="bg-surface-warning text-text-warning ring-border-soft" />
          ) : null}
          {overdue ? (
            <Chip label="Past due" toneClass="bg-surface-danger text-text-danger ring-border-soft" />
          ) : null}
        </div>

        <Panel padding="sm" radius="xl" elevation="none" className="space-y-3">
          <Field label="Assignee">
            <LedgerValue value={row.assignee?.name ?? null} />
          </Field>
          {/* NULL on every row written before `assigned_by_staff_id` existed
              (2026-08-08d, deliberately never backfilled) — the honest face is
              a dash, not the current user. */}
          <Field label="Assigned by">
            <LedgerValue value={row.assignedBy?.name ?? null} />
          </Field>
          <Field label="Handed over">
            <DateTimeValue value={new Date(row.assignedAtMs).toISOString()} />
          </Field>
          <Field label="Started">
            <DateTimeValue
              value={row.startedAtMs != null ? new Date(row.startedAtMs).toISOString() : null}
              fallback="Not started"
            />
          </Field>
          <Field label="Completed">
            <DateTimeValue
              value={row.completedAtMs != null ? new Date(row.completedAtMs).toISOString() : null}
              fallback="—"
            />
          </Field>
        </Panel>

        <Panel padding="sm" radius="xl" elevation="none" className="space-y-3">
          <Field label="Deadline">
            <DateRangePickerField
              variant="compact"
              value={row.deadlineAtMs != null ? new Date(row.deadlineAtMs) : undefined}
              onChange={(next) => onPatch(row.id, { deadlineAt: next.toISOString() })}
              ariaLabel="Task deadline"
              disabled={pending}
            />
          </Field>
          <Field label="Priority">
            <div className="flex flex-wrap gap-1">
              <Button
                variant={row.urgency === 'urgent' ? 'primary' : 'secondary'}
                size="sm"
                disabled={pending}
                onClick={() => onPatch(row.id, { priority: TASK_PRIORITY.urgent })}
              >
                Urgent
              </Button>
              <Button
                variant={row.urgency === 'normal' ? 'primary' : 'secondary'}
                size="sm"
                disabled={pending}
                onClick={() => onPatch(row.id, { priority: TASK_PRIORITY.normal })}
              >
                Normal
              </Button>
            </div>
          </Field>
        </Panel>

        {/* The paired ticket, in the SAME renderer the scan stations mount.
            A ticket with no provider mirror has no thread to show — the rail
            stays a task record rather than mounting a lookup that 404s. */}
        {ticketNumber != null ? (
          <Panel padding="none" radius="xl" elevation="none" className="min-h-64">
            <SupportTicketDetail ticketId={ticketNumber} embedded hideTitle />
          </Panel>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            disabled={pending}
            icon={pending ? <Loader2 className="animate-spin" /> : undefined}
            onClick={() => onPatch(row.id, { status: open ? 'DONE' : 'OPEN' })}
          >
            {open ? 'Mark done' : 'Reopen'}
          </Button>
          {open && row.startedAtMs == null ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => onPatch(row.id, { status: 'IN_PROGRESS' })}
            >
              Start it
            </Button>
          ) : null}
          {recordHref ? (
            <Button variant="ghost" onClick={() => router.push(recordHref)}>
              Open {taskDeskRecordLabel(row)}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Claims the single right-rail slot while a task is picked. Renders nothing
 * itself — `RightRailHost` renders the top occupant.
 */
export function TaskInspectorRail({
  row,
  nowMs,
  pending,
  onPatch,
  onClose,
}: {
  row: TaskDeskRow | null;
  nowMs: number;
  pending: boolean;
  onPatch: (id: number, patch: TaskDeskPatch) => void;
  onClose: () => void;
}) {
  useRegisterRightPanel({
    id: TASK_INSPECTOR_RAIL_ID,
    priority: RIGHT_RAIL_PRIORITY.detail,
    enabled: row != null,
    modal: false,
    ariaLabel: 'Task details',
    onClose,
    node: row ? (
      <TaskInspectorBody
        key={row.id}
        row={row}
        nowMs={nowMs}
        pending={pending}
        onPatch={onPatch}
        onClose={onClose}
      />
    ) : null,
  });
  return null;
}
