'use client';

/**
 * The Tasks list — two rows per task, no column header (owner 2026-09-29:
 * the row itself must say what to do).
 *
 *   ☐ ◯  Relist the Pixel 9 on eBay + Amazon  🔥                               [Reply ↵]
 *         ◷ Today 5 PM · 🎫 #48120 open · Reply to the customer · (MG)(AL) Michael, Ana · Listing refresh
 *
 * Row 1 is WHAT. Row 2 leads with a status pill when the task is anywhere
 * but To do / Done (`TASK_STATUS_FACE` — Pending, Blocked … read first), then
 * WHEN (the due date, far left, right under
 * the name — owner 2026-09-29), then the ticket (the house mark: the Ticket
 * glyph in warning ink, never a fill), the next step in words, and the people
 * on it. Under the cursor the right edge offers the one-click verb for that
 * next step. The selection box appears on hover, or everywhere once anything
 * is selected; the cursor is a sliding highlight (J / K).
 */

import { forwardRef, useEffect, useRef, useState } from 'react';
import { CircleCheck, FileText, Image as ImageIcon, Link2 } from 'lucide-react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { LayoutGroup, motion } from '@/design-system/motion';
import { Button, KeyboardKey } from '@/design-system/primitives';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { CompoundSelectStatusFace } from '@/components/tables/compound/CompoundSelectStatusFace';
import type { CompoundSelectStatus } from '@/components/tables/compound/compound-select-status';
import {
  TASK_BOARD_TYPE_FACE,
  isTaskBoardOpen,
  taskBoardNextStep,
  taskBoardRowType,
  type TaskBoardProject,
  type TaskBoardRow,
  type TaskBoardRowType,
} from '@/lib/task-board/task-board-model';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { TaskStatusPill } from '@/design-system/components/TaskStatusPill';
import { cn } from '@/utils/_cn';
import { DueChip, FollowUpFace, PeopleInline, PeopleStack, RepairChip, TicketChip } from './task-board-atoms';
import { TaskAlertButton } from './TaskAlertButton';

export interface TaskTableSection {
  key: string;
  /** Null = no heading (a flat list). */
  project: TaskBoardProject | null;
  rows: readonly TaskBoardRow[];
}

export function TaskTable({
  sections,
  cursorKey,
  openKey,
  selected,
  nowMs,
  onCursor,
  onOpen,
  onReply,
  onToggle,
  onSelect,
  onFocusProject,
  canAlert,
  label = 'Tasks',
}: {
  sections: readonly TaskTableSection[];
  cursorKey: string | null;
  openKey: string | null;
  selected: ReadonlySet<string>;
  nowMs: number;
  onCursor: (key: string) => void;
  onOpen: (row: TaskBoardRow) => void;
  /** Open the row straight onto its ticket thread. */
  onReply: (row: TaskBoardRow) => void;
  onToggle: (row: TaskBoardRow) => void;
  /** `range` = shift-click: select everything from the last pick to here. */
  onSelect: (row: TaskBoardRow, range: boolean) => void;
  /** Narrow the board to one project (`?project=`); again to widen. */
  onFocusProject: (name: string) => void;
  /** The row Alert verb — only under Everyone (owner 2026-09-30: never alert yourself from Mine). */
  canAlert: boolean;
  /** The list's accessible name (a wide-triage column names its type). */
  label?: string;
}) {
  const cursorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    cursorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [cursorKey]);
  const selecting = selected.size > 0;

  return (
    <div role="list" aria-label={label} data-testid="task-board-table" className="flex flex-col pb-24 pt-1">
      <LayoutGroup id="task-board-cursor">
        {sections.map((section) => (
          <section key={section.key} aria-label={section.project?.name ?? 'Tasks'}>
            {section.project ? <ProjectHeading project={section.project} nowMs={nowMs} onFocus={() => onFocusProject(section.project!.name)} /> : null}
            {section.rows.map((row) => (
              <TaskTableRow
                key={row.key}
                ref={row.key === cursorKey ? cursorRef : undefined}
                row={row}
                nowMs={nowMs}
                cursor={row.key === cursorKey}
                open={row.key === openKey}
                selected={selected.has(row.key)}
                selecting={selecting}
                canAlert={canAlert}
                onPointerMove={() => {
                  if (row.key !== cursorKey) onCursor(row.key);
                }}
                onOpen={() => onOpen(row)}
                onReply={() => onReply(row)}
                onToggle={() => onToggle(row)}
                onSelect={(range) => onSelect(row, range)}
              />
            ))}
          </section>
        ))}
      </LayoutGroup>
    </div>
  );
}

function ProjectHeading({ project, nowMs, onFocus }: { project: TaskBoardProject; nowMs: number; onFocus: () => void }) {
  const total = project.open + project.done;
  const pct = total > 0 ? Math.round((project.done / total) * 100) : 0;
  return (
    <div className="sticky top-0 z-[5] flex items-center gap-2.5 bg-surface-card/90 px-4 pb-1.5 pt-4 backdrop-blur-md">
      <button type="button" onClick={onFocus} className="truncate text-xs font-semibold text-text-default hover:underline">
        {project.name}
      </button>
      <span className="text-[11px] tabular-nums text-text-muted">
        {project.done}/{total}
      </span>
      <span className="relative h-1 w-20 overflow-hidden rounded-full bg-surface-sunken">
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full bg-emerald-600"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 30 }}
        />
      </span>
      <span className="ml-auto flex items-center gap-2">
        <PeopleStack people={project.people} max={4} />
        <DueChip dueMs={project.nextDueMs} nowMs={nowMs} done={false} />
      </span>
    </div>
  );
}

/** Line-2 inks at WCAG AA (≥4.5:1 on the card at 11px): orange-700 / red-700, never the -500/-600 tints. */
const NEXT_STEP_TONE = {
  warn: 'text-orange-700 dark:text-orange-300',
  late: 'text-red-700 dark:text-red-300',
  calm: 'text-text-muted',
} as const;

const TaskTableRow = forwardRef<
  HTMLDivElement,
  {
    row: TaskBoardRow;
    nowMs: number;
    cursor: boolean;
    open: boolean;
    selected: boolean;
    selecting: boolean;
    canAlert: boolean;
    onPointerMove: () => void;
    onOpen: () => void;
    onReply: () => void;
    onToggle: () => void;
    onSelect: (range: boolean) => void;
  }
>(function TaskTableRow(
  { row, nowMs, cursor, open, selected, selecting, canAlert, onPointerMove, onOpen, onReply, onToggle, onSelect },
  ref,
) {
  const [alertOpen, setAlertOpen] = useState(false);
  const step = taskBoardNextStep(row, nowMs);
  const type = taskBoardRowType(row);
  const context: string[] = [];
  if (row.record) context.push(row.record.label);
  if (row.team) context.push(`${row.team.done}/${row.team.total} done today`);

  return (
    <div
      ref={ref}
      role="listitem"
      aria-selected={selected}
      aria-current={open ? 'true' : undefined}
      data-task-key={row.key}
      data-testid="task-board-row"
      // Focusable, not tabbable: an anchored layer opened on the row (S) hands focus back here.
      tabIndex={-1}
      onPointerMove={onPointerMove}
      onClick={(event) => (event.shiftKey || event.metaKey || event.ctrlKey ? onSelect(event.shiftKey) : onOpen())}
      // Done rows stay fully legible (no opacity fade — it dropped line 2 below 4.5:1): the strike-through and the gutter check say done.
      className="group/row relative mx-2 flex cursor-default items-start gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2 outline-none"
    >
      {cursor || open || selected ? (
        <motion.span
          layoutId={open ? 'task-board-open' : selected ? undefined : 'task-board-cursor'}
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 rounded-xl',
            open
              ? 'bg-surface-selected ring-1 ring-border-soft'
              : selected
                ? 'bg-sky-50 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/30'
                : 'bg-surface-hover',
          )}
          transition={{ type: 'spring', stiffness: 600, damping: 44, mass: 0.6 }}
        />
      ) : null}

      <TaskGutter row={row} nowMs={nowMs} selected={selected} selecting={selecting} onSelect={onSelect} />

      <span className="relative flex min-w-0 flex-1 flex-col gap-[3px]">
        {/* Row 1 — what. The glyph is the type (sorting Everything by colour); the words are the task. */}
        <span className="flex min-w-0 items-center gap-1.5">
          <TypeGlyph row={row} />
          <span
            className={cn(
              'truncate text-[13px] font-medium leading-[18px]',
              row.done ? 'text-text-muted line-through decoration-text-muted' : 'text-text-default',
            )}
          >
            {row.title}
          </span>
        </span>

        {/* Row 2 — when, the type in words (once: no second ticket glyph), the next step, the people */}
        <span className="flex min-w-0 items-center gap-2 text-[11px] leading-4">
          {row.taskStatus && row.taskStatus !== 'TODO' && row.taskStatus !== 'DONE' ? (
            <TaskStatusPill status={row.taskStatus} />
          ) : null}
          <DueChip dueMs={row.dueMs} nowMs={nowMs} done={row.done} />
          <TypeWord row={row} type={type} />
          <FollowUpFace row={row} nowMs={nowMs} />
          {step ? <span className={cn('shrink-0 font-semibold', NEXT_STEP_TONE[step.tone])}>{step.label}</span> : null}
          <PeopleInline people={row.people} />
          {row.from ? (
            <span className="shrink-0 text-text-muted">
              from <StaffBadge staffId={row.from.id} name={row.from.name.split(' ')[0]} className="font-semibold" />
            </span>
          ) : null}
          {context.length > 0 ? <span className="shrink truncate text-text-muted">{context.join(' · ')}</span> : null}
          {row.detail && !row.ticket ? <span className="min-w-0 truncate text-text-muted">{row.detail}</span> : null}
          <Counts row={row} />
        </span>
      </span>

      {/* Right edge — under the cursor: Alert the owners, then the verb for the next step. */}
      <span
        className="relative flex shrink-0 items-center gap-1.5 self-center"
        // The alert popover portals, but its React events still bubble here — never let them open the row.
        onClick={(event) => event.stopPropagation()}
      >
        {canAlert && row.source === 'task' && isTaskBoardOpen(row) && (cursor || open || alertOpen) ? (
          <TaskAlertButton
            taskId={row.id}
            ownerIds={row.people.map((person) => person.id)}
            ticketNumber={row.ticket?.number ?? null}
            variant="row"
            open={alertOpen}
            onOpenChange={setAlertOpen}
          />
        ) : null}
        {!row.done && row.status !== 'CANCELED' ? (
          <Button
            variant={step?.action === 'reply' ? 'warning' : 'success'}
            size="sm"
            radius="pill"
            onClick={() => (step?.action === 'reply' ? onReply() : onToggle())}
            className={cn(
              'h-6 gap-1.5 pl-2.5 pr-1 text-[11px] transition-all',
              cursor || open ? 'opacity-100' : 'pointer-events-none w-0 overflow-hidden px-0 opacity-0',
            )}
          >
            {step?.action === 'reply' ? 'Reply' : 'Done'}
            <KeyboardKey size="xs" tone="inverse">
              {step?.action === 'reply' ? 'Enter' : 'D'}
            </KeyboardKey>
          </Button>
        ) : null}
      </span>
    </div>
  );
});

/** The hover every type face carries — what the colour means, in words. */
function typeHint(row: TaskBoardRow, type: TaskBoardRowType): string {
  const face = TASK_BOARD_TYPE_FACE[type];
  if (type === 'checklist') return `${face.hint} · ${row.cadence === 'recurring' ? 'every day' : 'today only'}`;
  if (type === 'project' && row.project) return `${face.hint} · ${row.project}`;
  if (type === 'ticket' && row.repair && !row.ticket) return 'Repair service ticket — a customer’s device is with us';
  return face.hint;
}

/** Line 1's lead: the row's type glyph in its own hue; hover names it. */
function TypeGlyph({ row }: { row: TaskBoardRow }) {
  const type = taskBoardRowType(row);
  const face = TASK_BOARD_TYPE_FACE[type];
  const Icon = face.icon;
  return (
    <HoverTooltip label={typeHint(row, type)} placement="above" focusable={false} asChild>
      <span data-task-type={type} className="inline-flex shrink-0 cursor-help rounded-md p-0.5 -m-0.5 transition-colors hover:bg-surface-sunken">
        <Icon aria-label={face.label} className={cn('size-3.5', face.ink)} strokeWidth={2.25} />
      </span>
    </HoverTooltip>
  );
}

/**
 * Line 2's type, in words and AA ink: `Daily checklist` · `Support #10025
 * open` · `Project · Listing refresh`. A plain task says nothing — its glyph
 * is enough. Hover names the type, same as the glyph.
 */
function TypeWord({ row, type }: { row: TaskBoardRow; type: TaskBoardRowType }) {
  if (type === 'task') return null;
  const face = TASK_BOARD_TYPE_FACE[type];
  return (
    <HoverTooltip label={typeHint(row, type)} placement="above" focusable={false} asChild>
      <span
        data-task-type-word={type}
        className={cn(
          'inline-flex min-w-0 shrink-0 cursor-help items-center gap-1 rounded px-0.5 -mx-0.5 font-semibold hover:bg-surface-sunken',
          // A repair line carries a number AND a worded status pill; the pill truncates past this.
          row.repair && !row.ticket ? 'max-w-[20rem] overflow-hidden' : 'max-w-[16rem]',
          face.text,
        )}
      >
        {face.label}
        {type === 'ticket' && row.ticket ? <TicketChip ticket={row.ticket} glyph={false} /> : null}
        {type === 'ticket' && row.repair && !row.ticket ? <RepairChip repair={row.repair} /> : null}
        {type === 'project' && row.project ? <span className="truncate font-medium">· {row.project}</span> : null}
      </span>
    </HoverTooltip>
  );
}

/**
 * The row's ONE left mark, in the same column as the select-all box — the
 * house select gutter (`CompoundSelect`): at rest it reports the row's state
 * (urgent = the yellow bolt, overdue = the triangle, done = an emerald
 * check); reaching for the row turns it into the selection square. So a task
 * never shows two checkmarks: select here, finish with D or the row's verb.
 */
function TaskGutter({
  row,
  nowMs,
  selected,
  selecting,
  onSelect,
}: {
  row: TaskBoardRow;
  nowMs: number;
  selected: boolean;
  selecting: boolean;
  onSelect: (range: boolean) => void;
}) {
  const resting = !selected && !selecting;
  const late = isTaskBoardOpen(row) && row.dueMs != null && row.dueMs < nowMs;
  const marks: CompoundSelectStatus[] = [];
  if (resting && !row.done) {
    if (row.urgent) marks.push({ kind: 'urgent', label: 'Urgent', flash: true });
    if (late) marks.push({ kind: 'attention', label: 'Overdue', flash: true });
  }
  return (
    <span className="relative flex h-[18px] w-4 shrink-0 items-center">
      {marks.length > 0 ? <CompoundSelectStatusFace statuses={marks} className="items-center" /> : null}
      {resting && row.done ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-emerald-600 transition-opacity group-hover/row:opacity-0 dark:text-emerald-400"
        >
          <CircleCheck className="size-4" strokeWidth={2.5} />
        </span>
      ) : null}
      <GridRowCheckbox
        checked={selected}
        onToggle={(event) => onSelect(event.shiftKey)}
        label={selected ? `Deselect ${row.title}` : `Select ${row.title}`}
        chrome={selecting ? 'always' : 'hover'}
        className="items-center pt-0"
      />
    </span>
  );
}

function Counts({ row }: { row: TaskBoardRow }) {
  if (row.linkCount + row.photoCount + row.docCount === 0) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2 pl-1 text-text-muted">
      {row.linkCount > 0 ? (
        <span className="inline-flex items-center gap-0.5">
          <Link2 aria-hidden className="size-3" />
          {row.linkCount}
        </span>
      ) : null}
      {row.photoCount > 0 ? (
        <span className="inline-flex items-center gap-0.5">
          <ImageIcon aria-hidden className="size-3" />
          {row.photoCount}
        </span>
      ) : null}
      {row.docCount > 0 ? (
        <span className="inline-flex items-center gap-0.5">
          <FileText aria-hidden className="size-3" />
          {row.docCount}
        </span>
      ) : null}
    </span>
  );
}
