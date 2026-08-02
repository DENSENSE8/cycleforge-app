'use client';

/**
 * Today's record plane — the picked task's detail, as a NON-MODAL right-rail
 * inspector.
 *
 * Composed, not hand-rolled: {@link Panel} owns the card shell, {@link
 * LedgerValue} / {@link DateTimeValue} own the value typography, the CopyChip
 * family owns the identifiers, and {@link Button} owns the action. The pane this
 * replaces hand-typed its own chips (`rounded bg-blue-50 px-1.5 …`) and read
 * `row.status.replace('_', ' ')` inline — which is why a work-order status now
 * resolves through `work-status-display`.
 *
 * **Occupant id is stable (`detail:my-day`), not per-record.** Walking a queue
 * row by row is the core loop here, and `RightRailHost` keys its
 * `AnimatePresence` on the id — a per-record id plays exit → empty → enter on
 * every step (`display/motion-crossfade.md`). The exception's preconditions hold
 * because this pane is pure display: it re-seeds entirely from props on every
 * record change and holds no draft to flush.
 */

import Link from 'next/link';
import { ChevronRight, ExternalLink, X } from '@/components/Icons';
import { OrderIdChip, TicketChip, getLast8 } from '@/components/ui/CopyChip';
import { DateTimeValue } from '@/design-system/components/DateTimeValue';
import { LedgerValue } from '@/design-system/components/LedgerValue';
import { Button, IconButton, Panel } from '@/design-system/primitives';
import { RIGHT_RAIL_PRIORITY } from '@/lib/right-rail/store';
import { useRegisterRightPanel } from '@/components/right-rail/useRegisterRightPanel';
import { workStatusChipClass, workStatusLabel } from '@/lib/work-orders/work-status-display';
import {
  myDayLaneChipClass,
  myDayLaneDot,
  myDayLaneLabel,
  type MyDayTask,
} from '@/lib/my-day/my-day-tasks';
import { assignmentHeaderContextText } from '@/design-system/components/work-order-assignment/work-order-assignment-shared';
import { cn } from '@/utils/_cn';

/** Stable id — see the docblock. Do NOT key this on the task. */
const MY_DAY_RAIL_ID = 'detail:my-day';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{label}</p>
      {children}
    </div>
  );
}

function TaskChip({ label, toneClass }: { label: string; toneClass: string }) {
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

function MyDayTaskInspectorBody({
  task,
  onClose,
}: {
  task: MyDayTask;
  onClose: () => void;
}) {
  const status = workStatusLabel(task.status);
  const context =
    task.source.kind === 'work_order'
      ? assignmentHeaderContextText(task.source.row)
      : 'Needs attention';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{context}</p>
          <h2 className="inline-flex items-center gap-2 text-role-title text-text-default">
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', myDayLaneDot(task.lane))}
              aria-hidden
            />
            <span className="min-w-0 truncate">{task.title}</span>
          </h2>
          <p className="text-role-caption text-text-muted">{task.subtitle}</p>
        </div>
        {/* A non-modal occupant owns an explicit close — there is no scrim to
            click off (`source-of-truth.md` → Right-rail modality). */}
        <IconButton
          size="sm"
          ariaLabel="Close task details"
          onClick={onClose}
          icon={<X className="h-4 w-4" />}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <TaskChip label={myDayLaneLabel(task.lane)} toneClass={myDayLaneChipClass(task.lane)} />
        {status ? <TaskChip label={status} toneClass={workStatusChipClass(task.status)} /> : null}
      </div>

      <Panel padding="sm" radius="xl" elevation="none" className="space-y-3">
        <Field label="Queue">
          <LedgerValue value={task.queueLabel} truncate />
        </Field>
        <Field label="Record">
          {task.recordLabel == null ? (
            <LedgerValue value={null} />
          ) : task.source.kind === 'interrupt' ? (
            <TicketChip value={task.recordLabel} display={task.recordLabel} dense />
          ) : (
            <OrderIdChip value={task.recordLabel} display={getLast8(task.recordLabel)} dense />
          )}
        </Field>
        <Field label="Due">
          <DateTimeValue value={task.deadlineAt} fallback="No deadline" />
        </Field>
        <Field label="Last update">
          <DateTimeValue value={task.updatedAt} />
        </Field>
      </Panel>

      <Link href={task.href} className="inline-flex">
        <Button variant="primary" icon={<ExternalLink />} iconRight={<ChevronRight />}>
          {task.source.kind === 'interrupt' ? 'Investigate' : 'Open in workspace'}
        </Button>
      </Link>
    </div>
  );
}

/**
 * Claims the single right-rail slot while a task is picked. Renders nothing
 * itself — `RightRailHost` renders the top occupant, which is why no surface
 * ever hand-rolls its own `fixed right-0` panel.
 */
export function MyDayTaskInspectorRail({
  task,
  onClose,
}: {
  task: MyDayTask | null;
  onClose: () => void;
}) {
  useRegisterRightPanel({
    id: MY_DAY_RAIL_ID,
    priority: RIGHT_RAIL_PRIORITY.detail,
    enabled: task != null,
    modal: false,
    ariaLabel: 'Task details',
    onClose,
    node: task ? <MyDayTaskInspectorBody task={task} onClose={onClose} /> : null,
  });
  return null;
}
