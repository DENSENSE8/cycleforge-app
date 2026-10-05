'use client';

/**
 * The Tasks list — no column header (owner 2026-09-29: the row itself must
 * say what to do). P1 (progressive disclosure, level 1): what is on the row
 * says it is important, in reading order —
 *
 *   ☐ ◯  Relist the Pixel 9 on eBay + Amazon  🔥                                              [Reply]
 *         ◷ Today 5 PM  (In progress) · 🎫 #48120 open · Reply to the customer   ▣ Listing refresh · (MG)(AL) Michael, Ana   🔗 2
 *
 * Line 1 is WHAT. Line 2 is WHEN + STATE: the due date at the far left (the
 * sort key sits where the eye starts every scan) in a fixed slot, then the
 * status pill on every open task (To do included — the column aligns), then
 * the ticket (the house mark: the Ticket glyph in warning ink, never a fill),
 * the chase and the next step in words — then WHO + WHERE (the project and the
 * people on it) on the SAME line when the row is wide enough. A narrow row
 * (split record pane, small window) wraps WHO + WHERE whole onto line 3.
 * The note body (pasted
 * `To:` / `Subject:` headers) and the record context are level 2: the
 * title's hover card and the record, never truncated prose on the row.
 * Under the cursor the right edge offers the one tonal verb for the next
 * step (P2). The selection box appears on hover, or everywhere once
 * anything is selected; the cursor is a sliding highlight (J / K).
 */

import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Calendar, CircleCheck, FileText, Image as ImageIcon, Link2, Zap } from 'lucide-react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { LayoutGroup, motion } from '@/design-system/motion';
import { Button } from '@/design-system/primitives';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import {
  TASK_BOARD_TYPE_FACE,
  isTaskBoardOpen,
  taskBoardNextStep,
  taskBoardRowType,
  type TaskBoardGroup,
  type TaskBoardProject,
  type TaskBoardRow,
  type TaskBoardRowType,
  type TaskBoardUrgency,
} from '@/lib/task-board/task-board-model';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { TaskStatusPill } from '@/design-system/components/TaskStatusPill';
import { cn } from '@/utils/_cn';
import { DueChip, FollowUpFace, PeopleInline, PeopleStack, RepairChip, TicketChip } from './task-board-atoms';
import { DUE_TONE_CLASS } from '@/design-system/tokens/task-due';
import { TaskAlertButton } from './TaskAlertButton';

export interface TaskTableSection {
  key: string;
  /** A grouped list's heading facts (`taskBoardGroups`, rows aside); absent = one flat list, no heading. */
  group?: Omit<TaskBoardGroup, 'rows'>;
  /** group=project: the project's roll-up its heading paints (progress, people, next due); null otherwise. */
  project: TaskBoardProject | null;
  rows: readonly TaskBoardRow[];
  /** Every row here is this type (a type column) — rows drop their type glyph. A type group implies it too. */
  type?: TaskBoardRowType;
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
          <section
            key={section.key}
            aria-label={section.group?.label ?? 'Tasks'}
            data-task-group={section.group?.key}
            // Every group sits under a full-strength edge hairline (not the faint row rule). P4 (proximity +
            // common region): the section's own vertical padding keeps the hover / cursor / selected face
            // clear of the hairline above and below — a row never merges with a divider.
            className={section.group ? 'border-t border-border-default py-1.5 first:border-t-0' : undefined}
          >
            {section.group ? (
              section.project ? (
                <ProjectHeading project={section.project} nowMs={nowMs} onFocus={() => onFocusProject(section.project!.name)} />
              ) : (
                <GroupHeading group={section.group} count={section.rows.length} />
              )
            ) : null}
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
                // Say a fact once (owner 2026-10-03): under a type heading ("Long-term projects") or in a type
                // column every row is that type, so the per-row type glyph would repeat it. Other groupings keep it.
                typeShown={!(section.type ?? section.group?.type)}
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
    <div className="sticky top-0 z-[5] flex items-center gap-2.5 bg-surface-card/90 px-4 pb-1.5 pt-2 backdrop-blur-md">
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

/** Urgency headings wear the due inks: Overdue red, Today / Tomorrow orange (owner 2026-09-29: tomorrow is urgent too). */
const URGENCY_INK: Readonly<Record<TaskBoardUrgency, string>> = {
  overdue: DUE_TONE_CLASS.late,
  today: DUE_TONE_CLASS.today,
  tomorrow: DUE_TONE_CLASS.soon,
  week: 'font-semibold text-text-default',
  later: 'font-semibold text-text-default',
  none: 'font-semibold text-text-muted',
  closed: 'font-semibold text-text-muted',
};

/**
 * Any group's sticky heading, then the row count: a type wears its glyph and
 * word in its own ink (the sidebar's name); a status wears its pill; an
 * urgency bucket wears the due inks; the rest (No project) plain words.
 */
function GroupHeading({ group, count }: { group: Omit<TaskBoardGroup, 'rows'>; count: number }) {
  let lead: ReactNode;
  if (group.type) {
    const face = TASK_BOARD_TYPE_FACE[group.type];
    const Icon = face.icon;
    lead = (
      <>
        <Icon aria-hidden className={cn('size-3.5 shrink-0', face.ink)} strokeWidth={2.25} />
        <h3 className={cn('text-xs font-semibold', face.text)}>{group.label}</h3>
      </>
    );
  } else if (group.status) {
    lead = (
      <h3 className="flex">
        <TaskStatusPill status={group.status} />
      </h3>
    );
  } else {
    lead = (
      <h3 className={cn('text-xs', group.urgency ? URGENCY_INK[group.urgency] : 'font-semibold text-text-default')}>{group.label}</h3>
    );
  }
  return (
    <div className="sticky top-0 z-[5] flex items-center gap-2 bg-surface-card/90 px-4 pb-1.5 pt-2 backdrop-blur-md">
      {lead}
      <span className="text-[11px] font-medium tabular-nums text-text-muted">{count}</span>
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
    /** False under a type heading — the heading already names the type. */
    typeShown: boolean;
    onPointerMove: () => void;
    onOpen: () => void;
    onReply: () => void;
    onToggle: () => void;
    onSelect: (range: boolean) => void;
  }
>(function TaskTableRow(
  { row, nowMs, cursor, open, selected, selecting, canAlert, typeShown, onPointerMove, onOpen, onReply, onToggle, onSelect },
  ref,
) {
  const [alertOpen, setAlertOpen] = useState(false);
  const step = taskBoardNextStep(row, nowMs);
  // P1 level 2: the record context and the note remainder (pasted `To:` / buyer / `Subject:` headers live
  // here) never print on the row — the title's hover card discloses them, the record holds them in full.
  const disclosure = taskTableDisclosure(row);

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
        {/* Line 1 — WHAT. The glyph is the type (sorting Everything by colour) unless a type heading already says it;
            the words are the task; hover discloses the rest (level 2). */}
        <span className="flex min-w-0 items-center gap-1.5">
          {typeShown ? <TypeGlyph row={row} /> : null}
          <HoverTooltip label={disclosure} disabled={!disclosure} placement="below" focusable={false} openDelayMs={350} asChild>
            <span
              // The disclosure stays in the accessible name's description, off the painted row.
              aria-description={disclosure || undefined}
              data-task-disclosure={disclosure ? '' : undefined}
              className={cn(
                'truncate text-[13px] font-medium leading-[18px]',
                row.done ? 'text-text-muted line-through decoration-text-muted' : 'text-text-default',
              )}
            >
              {row.title}
            </span>
          </HoverTooltip>
        </span>

        {/* Lines 2–3 — WHEN + STATE, then WHO + WHERE (P1), in ONE wrapping band (owner 2026-10-03: "at maximum
            width the people involved display on the second row, not the third"). Each half is one flex item; when
            both fit the row width they share line 2, and when they do not (a narrow list, the split record pane)
            WHO + WHERE drops whole onto line 3. Driven by the row's own width, never a viewport breakpoint. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-[3px] text-[11px] font-medium">
          {/* WHEN + STATE: due far left in a fixed slot, the status pill beside it on every open task so the column
              aligns, then the ticket (once: no second ticket glyph), the chase, the next step. One line tall and
              wrapping: a fact that does not fit drops whole onto the hidden second line — never a clipped glyph, and
              it stays in the accessible text. 20px = the tallest thing on the band (an xs staff avatar; a ringed
              status pill is 17px) — at 16px the repair chip's bottom ring and the avatars were cut off. */}
          <span className="flex h-5 min-w-0 max-w-full flex-wrap items-center gap-x-2 overflow-hidden leading-5">
            {row.taskStatus && row.taskStatus !== 'DONE' ? (
              <>
                <span className="inline-flex min-w-28 shrink-0">
                  {row.dueMs != null ? (
                    <DueChip dueMs={row.dueMs} nowMs={nowMs} done={row.done} />
                  ) : (
                    // The slot reads as data, not a gap: undated is a fact too (text-soft clears AA on every row face).
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-text-soft">
                      <Calendar aria-hidden className="size-3" strokeWidth={2.25} />
                      No due date
                    </span>
                  )}
                </span>
                <TaskStatusPill status={row.taskStatus} />
              </>
            ) : (
              <DueChip dueMs={row.dueMs} nowMs={nowMs} done={row.done} />
            )}
            <TicketWord row={row} />
            <FollowUpFace row={row} nowMs={nowMs} />
            {step ? (
              <span className={cn('shrink-0 font-semibold', NEXT_STEP_TONE[step.tone])}>{step.label}</span>
            ) : null}
          </span>

          {/* WHO + WHERE, only when there is one: the project and the people on one line. */}
          {row.project || row.people.length > 0 || row.from ? (
            <span className="flex h-5 min-w-0 max-w-full items-center gap-2 overflow-hidden leading-5">
              {row.project ? <ProjectWord project={row.project} /> : null}
              <PeopleInline people={row.people} />
              {row.from ? (
                // Shrinks to an ellipsis, like the project and the names beside it — never a clipped glyph.
                <span className="min-w-0 truncate text-text-muted">
                  from <StaffBadge staffId={row.from.id} name={row.from.name.split(' ')[0]} className="font-semibold" />
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </span>

      {/* Right edge — the link / photo / doc counts at rest (never a line of their own); under the cursor: Alert the
          owners, then the verb for the next step. */}
      <span
        className="relative flex shrink-0 items-center gap-1.5 self-center"
        // The alert popover portals, but its React events still bubble here — never let them open the row.
        onClick={(event) => event.stopPropagation()}
      >
        <Counts row={row} />
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
          // P2 (emphasis ladder): a verb on every row is tonal — light tint, dark ink, AA text — never a dark fill.
          <HoverTooltip label={step?.action === 'reply' ? 'Reply' : 'Done'} shortcut={step?.action === 'reply' ? 'Enter' : 'D'} placement="below" asChild>
            <Button
              variant={step?.action === 'reply' ? 'warningSoft' : 'successSoft'}
              size="sm"
              radius="pill"
              onClick={() => (step?.action === 'reply' ? onReply() : onToggle())}
              className={cn(
                'h-6 gap-1.5 px-2.5 text-[11px] transition-all',
                cursor || open ? 'opacity-100' : 'pointer-events-none w-0 overflow-hidden px-0 opacity-0',
              )}
            >
              {step?.action === 'reply' ? 'Reply' : 'Done'}
            </Button>
          </HoverTooltip>
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
 * Line 2's ticket: `#10025 Open` · `RS-0037 Pending Repair` — the number in the ticket ink and its status
 * pill; hover names it.
 */
function TicketWord({ row }: { row: TaskBoardRow }) {
  if (!row.ticket && !row.repair) return null;
  const repairOnly = row.repair != null && !row.ticket;
  return (
    <HoverTooltip
      label={repairOnly ? 'Repair service ticket — a customer’s device is with us' : 'Helpdesk ticket linked to this task'}
      placement="above"
      focusable={false}
      asChild
    >
      <span
        data-task-ticket-word=""
        className={cn(
          'inline-flex min-w-0 shrink-0 cursor-help items-center gap-1 rounded px-0.5 -mx-0.5 font-semibold hover:bg-surface-sunken',
          // A repair line carries a number AND a worded status pill; the pill truncates past this.
          repairOnly ? 'max-w-[20rem] overflow-hidden' : 'max-w-[16rem]',
          'text-orange-700 dark:text-orange-300',
        )}
      >
        {row.ticket ? <TicketChip ticket={row.ticket} glyph={false} /> : null}
        {repairOnly && row.repair ? <RepairChip repair={row.repair} /> : null}
      </span>
    </HoverTooltip>
  );
}

/** Line 3's WHERE: the project's glyph and name in the project ink (AA). */
function ProjectWord({ project }: { project: string }) {
  const face = TASK_BOARD_TYPE_FACE.project;
  const Icon = face.icon;
  return (
    <span data-task-project className={cn('inline-flex min-w-0 max-w-[16rem] shrink items-center gap-1 font-semibold', face.text)}>
      <Icon aria-hidden className="size-3 shrink-0" strokeWidth={2.25} />
      <span className="truncate">{project}</span>
    </span>
  );
}

/** The hover card can carry a long pasted note; past this it ends in an ellipsis (the record holds it whole). */
const DISCLOSURE_MAX = 320;

/** Level 2 (P1): the record context, the checklist's team tally and the note remainder, one per line. */
function taskTableDisclosure(row: TaskBoardRow): string {
  const text = [row.record?.label, row.team ? `${row.team.done}/${row.team.total} done today` : null, row.detail]
    .filter(Boolean)
    .join('\n');
  return text.length > DISCLOSURE_MAX ? `${text.slice(0, DISCLOSURE_MAX - 1).trimEnd()}…` : text;
}

/**
 * The row's ONE left mark, in the same column as the select-all box — the
 * house select gutter (`GridRowCheckbox`): at rest it reports the row's state
 * (overdue = the triangle, else urgent = the yellow bolt, done = an emerald
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
  const restingMark = !resting
    ? null
    : row.done
      ? { Icon: CircleCheck, ink: 'text-emerald-600 dark:text-emerald-400', label: 'Done' }
      : late
        ? { Icon: AlertTriangle, ink: 'text-text-danger', label: 'Overdue' }
        : row.urgent
          ? { Icon: Zap, ink: 'text-text-warning', label: 'Urgent' }
          : null;
  return (
    <span className="relative flex h-[18px] w-4 shrink-0 items-center">
      {restingMark ? (
        <span
          aria-hidden
          title={restingMark.label}
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity group-hover/row:opacity-0',
            restingMark.ink,
          )}
        >
          <restingMark.Icon className="size-4" strokeWidth={2.5} />
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
    <span className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-text-muted">
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
