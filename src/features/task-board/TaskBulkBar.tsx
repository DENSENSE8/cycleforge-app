'use client';

/**
 * The list's top strip. Idle: the select-all box, Open · Waiting · Done · All and the
 * project in focus on the left; WHOSE work — Mine · Handed off · Everyone —
 * dead centre for triage (owner 2026-09-29, moved out of the sidebar), never
 * overlapped; on the right the tally, then Display (Group by · Order by, the
 * house sort menu), List · Columns (`V`) and the
 * checklist column switch (`H`) as icons (hover names them). As the strip
 * narrows (split view) the tally hides, then Whose work, then Status fold
 * into one compact menu each; the right icons never clip. With a
 * selection it becomes the bulk verbs — Done, Reopen, Urgent,
 * Due today, Add person — over exactly the selected rows (a checklist item
 * takes Done / Reopen only).
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CalendarClock,
  Check,
  ChevronDown,
  CircleCheck,
  Columns3,
  List,
  ListChecks,
  RotateCcw,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button as ChromeButton } from '@/components/ui/button';
import { Zap } from '@/components/Icons';
import { AnimatePresence, motion } from '@/design-system/motion';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/design-system/primitives/DropdownMenu';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { useActiveStaffDirectory } from '@/components/sidebar/hooks';
import {
  TASK_BOARD_GROUP_BYS,
  TASK_BOARD_GROUP_BY_LABEL,
  TASK_BOARD_SORTS,
  TASK_BOARD_SORT_LABEL,
  parseTaskBoardGroupBy,
  parseTaskBoardSort,
  type TaskBoardGroupBy,
  type TaskBoardSort,
  type TaskBoardStatus,
} from '@/lib/task-board/task-board-model';
import { DataTableSortMenu, type DataTableSortOption } from '@/components/tables/DataTable';
import { TASK_STATUS_FACE } from '@/design-system/tokens/task-status';
import type { TaskDeskScope } from '@/features/tasks/useTaskDesk';
import type { TaskBoardLayout } from './useTaskBoard';
import { cn } from '@/utils/_cn';
import { PersonDot } from './task-board-atoms';

/** P3 (Linear display options): Group by and Order by, two questions in one Display menu. */
const GROUP_OPTIONS: readonly DataTableSortOption[] = TASK_BOARD_GROUP_BYS.map((id) => ({
  id: `group:${id}`,
  label: TASK_BOARD_GROUP_BY_LABEL[id],
  group: 'Group by',
}));
const SORT_OPTIONS: readonly DataTableSortOption[] = TASK_BOARD_SORTS.map((id) => ({
  id: `sort:${id}`,
  label: TASK_BOARD_SORT_LABEL[id],
  group: 'Order by',
}));

/** The Display menu's state: what the list groups and orders by, and whether either left the house default. */
export interface TaskBoardDisplay {
  group: TaskBoardGroupBy;
  sort: TaskBoardSort;
  /** Either choice is off the default — the trigger lights. */
  hot: boolean;
  onGroup: (group: TaskBoardGroupBy) => void;
  onSort: (sort: TaskBoardSort) => void;
}

const STATUS_OPTIONS: readonly { id: TaskBoardStatus; label: string }[] = [
  { id: 'open', label: 'Open' },
  // Open rows on a hold (Pending · Follow-up · Blocked — `TASK_HOLDS`).
  { id: 'waiting', label: 'Waiting' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
];

const SCOPE_OPTIONS: readonly { id: TaskDeskScope; label: string }[] = [
  { id: 'mine', label: 'Mine' },
  { id: 'handed', label: 'Handed off' },
  { id: 'everyone', label: 'Everyone' },
];

/** Icon-only (the toolbar must leave the scope segment dead centre with the rail open); the hover names it. */
const LAYOUT_OPTIONS: readonly { id: TaskBoardLayout; label: string; icon: LucideIcon }[] = [
  { id: 'list', label: 'List', icon: List },
  { id: 'columns', label: 'Columns — one per type', icon: Columns3 },
];

export interface TaskBulkVerbs {
  done: () => void;
  reopen: () => void;
  urgent: () => void;
  dueToday: () => void;
  addPerson: (staffId: number) => void;
}

export function TaskBulkBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClear,
  verbs,
  canReopen,
  canDone,
  hasTasks,
  status,
  onStatus,
  scope,
  onScope,
  project,
  onClearProject,
  openCount,
  lateCount,
  waitingCount,
  layout,
  onLayout,
  checklistOn,
  onChecklist,
  display,
  error,
}: {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  verbs: TaskBulkVerbs;
  canReopen: boolean;
  canDone: boolean;
  /** The selection holds at least one task (not only checklist items). */
  hasTasks: boolean;
  status: TaskBoardStatus;
  onStatus: (status: TaskBoardStatus) => void;
  scope: TaskDeskScope;
  onScope: (scope: TaskDeskScope) => void;
  project: string | null;
  onClearProject: () => void;
  openCount: number;
  lateCount: number;
  /** Open rows on a hold (Pending · Follow-up · Blocked) in the same tally. */
  waitingCount: number;
  layout: TaskBoardLayout;
  onLayout: (layout: TaskBoardLayout) => void;
  /** The pinned Daily checklist column is on (the staffer's remembered choice). */
  checklistOn: boolean;
  onChecklist: (on: boolean) => void;
  /** Group by / Order by (`?group=` / `?sort=`, remembered per staffer). */
  display: TaskBoardDisplay;
  error: string | null;
}) {
  const selecting = selectedCount > 0;
  const all = selecting && selectedCount === totalCount;
  const grouping =
    layout === 'columns' ? '' : display.group === 'none' ? 'no grouping, ' : `group by ${TASK_BOARD_GROUP_BY_LABEL[display.group].toLowerCase()}, `;
  const displayHint = `Display — ${grouping}order by ${TASK_BOARD_SORT_LABEL[display.sort].toLowerCase()}`;

  return (
    // One container for the whole strip: as it narrows (split view), the controls collapse in a fixed order —
    // the tally hides, then Whose work, then Status fold into one compact menu each (P1/P3: the most-used
    // stays visible); the right icons never clip. Tiers measured on the live strip (2026-10-03):
    // full segments need ≥42.5rem, a compact scope ≥36rem, both compact keep the scope centred ≥27.5rem,
    // below that the right column is pinned to the icons' own width.
    <div className="@container/taskbar flex h-11 shrink-0 items-center gap-2 border-b border-border-hairline px-3" data-testid="task-board-toolbar">
      {/* The same square, in the same column, as every row's gutter below it. */}
      <span className="relative ml-[2px] flex h-[18px] w-4 shrink-0 items-center">
        <GridRowCheckbox
          checked={all ? true : selecting ? 'mixed' : false}
          onToggle={all ? onClear : onSelectAll}
          label={all ? 'Clear selection' : 'Select all'}
          disabled={totalCount === 0}
          className="items-center pt-0"
        />
      </span>

      <AnimatePresence mode="popLayout" initial={false}>
        {selecting ? (
          <motion.div
            key="bulk"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            className="flex min-w-0 flex-1 items-center gap-1.5"
            data-testid="task-board-bulk"
          >
            <span className="mr-1 text-xs font-semibold tabular-nums text-text-default">{selectedCount} selected</span>
            {!all ? (
              <button type="button" onClick={onSelectAll} className="mr-1 text-[11px] font-medium text-sky-700 hover:underline dark:text-sky-300">
                Select all {totalCount}
              </button>
            ) : null}
            <BulkButton icon={<CircleCheck className="size-3.5" />} label="Done" hint="D" onClick={verbs.done} disabled={!canDone} tone="done" />
            <BulkButton icon={<RotateCcw className="size-3.5" />} label="Reopen" onClick={verbs.reopen} disabled={!canReopen} />
            <BulkButton icon={<Zap className="size-3.5 text-text-warning" />} label="Urgent" onClick={verbs.urgent} disabled={!hasTasks} />
            <BulkButton icon={<CalendarClock className="size-3.5" />} label="Due today" onClick={verbs.dueToday} disabled={!hasTasks} />
            <AddPersonButton disabled={!hasTasks} onPick={verbs.addPerson} />
            <HoverTooltip label="Clear selection" shortcut="Esc" placement="below" asChild>
              <button
                type="button"
                onClick={onClear}
                className="ml-auto inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-default"
              >
                <X className="size-3" />
                Clear
              </button>
            </HoverTooltip>
          </motion.div>
        ) : (
          <motion.div
            key="filters"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_8.5rem] items-center gap-2 @[27.5rem]/taskbar:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
          >
            {/* overflow-hidden on both flanks: whatever the width, neither can reach the centred scope. */}
            <span className="flex min-w-0 items-center gap-2 overflow-hidden">
              <Segmented
                label="Status"
                layoutId="task-board-status"
                options={STATUS_OPTIONS}
                value={status}
                onChange={onStatus}
                className="hidden @[36rem]/taskbar:inline-flex"
                compact="@[36rem]/taskbar:hidden"
              />
              {project ? (
                <button
                  type="button"
                  onClick={onClearProject}
                  className="inline-flex h-6 min-w-0 items-center gap-1 rounded-full bg-surface-accent px-2.5 text-[11px] font-semibold text-text-accent"
                >
                  <span className="truncate">{project}</span>
                  <X className="size-3 shrink-0" />
                </button>
              ) : null}
              {error ? (
                <span role="alert" className="truncate text-[11px] text-text-danger">
                  {error}
                </span>
              ) : null}
            </span>
            {/* The checklist column is the shift's shared list — whose-work scope does not apply to it, so the segment stands down while it is open (owner 2026-09-30). */}
            {checklistOn ? null : (
              <Segmented
                label="Whose work"
                layoutId="task-board-scope"
                options={SCOPE_OPTIONS}
                value={scope}
                onChange={onScope}
                className="hidden @[42.5rem]/taskbar:inline-flex"
                compact="@[42.5rem]/taskbar:hidden"
              />
            )}
            <span className="@container flex min-w-0 items-center justify-end gap-3 overflow-hidden whitespace-nowrap text-[11px] tabular-nums text-text-muted">
              {/* The tally steps aside whole when the flank is too narrow for it AND the controls (split view; 20rem
                  fits a three-digit open count with waiting and late) — never clipped mid-word; the controls stay. */}
              <span className="hidden items-center gap-3 @[20rem]:flex">
                <span>
                  <span className="font-semibold text-text-default">{openCount}</span> open
                </span>
                {waitingCount > 0 ? (
                  <span className={TASK_STATUS_FACE.PENDING.ink}>
                    <span className="font-semibold">{waitingCount}</span> waiting
                  </span>
                ) : null}
                {lateCount > 0 ? (
                  <span className="text-text-danger">
                    <span className="font-semibold">{lateCount}</span> late
                  </span>
                ) : null}
              </span>
              {/* An icon like its neighbours (hover names it and what it holds). Columns are the type split already: only Order by applies there. */}
              <HoverTooltip
                label={displayHint}
                placement="below"
                focusable={false}
                className="inline-flex shrink-0"
              >
                <DataTableSortMenu
                  options={layout === 'columns' ? SORT_OPTIONS : [...GROUP_OPTIONS, ...SORT_OPTIONS]}
                  active={null}
                  hot={display.hot}
                  selected={[`group:${display.group}`, `sort:${display.sort}`]}
                  label="Display"
                  align="end"
                  testId="task-board-display"
                  onSelect={(id) => {
                    const [question, value] = id.split(':');
                    if (question === 'group') {
                      const next = parseTaskBoardGroupBy(value);
                      if (next) display.onGroup(next);
                    } else {
                      const next = parseTaskBoardSort(value);
                      if (next) display.onSort(next);
                    }
                  }}
                />
              </HoverTooltip>
              <Segmented label="Layout" layoutId="task-board-layout" options={LAYOUT_OPTIONS} value={layout} onChange={onLayout} shortcut="V" />
              {/* The house toggle faces: `active` = pressed (sunken fill, full ink), `ghost` = off — never a pale tint. */}
              <HoverTooltip
                label={checklistOn ? 'Hide the Daily checklist column' : 'Show the Daily checklist column'}
                shortcut="H"
                placement="below"
                focusable={false}
                asChild
              >
                <ChromeButton
                  variant={checklistOn ? 'active' : 'ghost'}
                  size="icon"
                  aria-pressed={checklistOn}
                  aria-label="Daily checklist column"
                  onClick={() => onChecklist(!checklistOn)}
                  data-testid="task-board-checklist-toggle"
                  className="rounded-full"
                >
                  <ListChecks aria-hidden />
                </ChromeButton>
              </HoverTooltip>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * One sunken pill track; the current option rides a sliding card. An option with an icon paints only the icon; the hover names it.
 * With `compact`, the same choice also paints as one pill showing the current option that opens the house
 * DropdownMenu (the TriageSelectBar pattern: items, a check on the current) — the caller's container query
 * (`className` / `compact`) decides which face shows, so a narrow strip folds the track instead of clipping it.
 */
function Segmented<T extends string>({
  label,
  layoutId,
  options,
  value,
  onChange,
  shortcut,
  className,
  compact,
}: {
  label: string;
  layoutId: string;
  options: readonly { id: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
  /** The key that cycles the options — shown in each icon option's hover. */
  shortcut?: string;
  /** The track's visibility (container-query classes). */
  className?: string;
  /** Set: also paint the compact menu face, with these visibility classes. */
  compact?: string;
}) {
  const current = options.find((option) => option.id === value) ?? options[0]!;
  return (
    <>
      {compact != null ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${label}: ${current.label}`}
              className={cn(
                'inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-surface-sunken pl-2.5 pr-1.5 text-[11px] font-semibold text-text-default hover:bg-surface-hover',
                compact,
              )}
            >
              {current.label}
              <ChevronDown aria-hidden className="size-3 text-text-muted" strokeWidth={2.5} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {options.map((option) => (
              <DropdownMenuItem key={option.id} onSelect={() => onChange(option.id)} className="justify-between text-xs">
                {option.label}
                {option.id === value ? <Check aria-hidden /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <div role="radiogroup" aria-label={label} className={cn('relative inline-flex shrink-0 rounded-full bg-surface-sunken p-0.5', className)}>
        {options.map((option) => {
          const Icon = option.icon;
          const button = (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={value === option.id}
              aria-label={Icon ? option.label : undefined}
              onClick={() => onChange(option.id)}
              className={cn(
                'relative z-0 whitespace-nowrap rounded-full py-0.5 text-[11px] font-semibold transition-colors',
                Icon ? 'px-1.5' : 'px-2.5',
                value === option.id ? 'text-text-default' : 'text-text-muted hover:text-text-default',
              )}
            >
              {value === option.id ? (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-0 -z-10 rounded-full bg-surface-card shadow-sm"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              ) : null}
              {Icon ? <Icon className="size-3.5" aria-hidden /> : option.label}
            </button>
          );
          return Icon ? (
            <HoverTooltip key={option.id} label={option.label} shortcut={shortcut} placement="below" focusable={false} asChild>
              {button}
            </HoverTooltip>
          ) : (
            button
          );
        })}
      </div>
    </>
  );
}

function BulkButton({
  icon,
  label,
  hint,
  onClick,
  disabled,
  tone = 'soft',
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'soft' | 'done';
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-colors disabled:opacity-35',
        tone === 'done'
          ? 'bg-emerald-700 text-white shadow-sm shadow-emerald-700/30 hover:bg-emerald-800'
          : 'bg-surface-sunken text-text-default hover:bg-surface-hover',
      )}
    >
      {icon}
      {label}
    </button>
  );
  return hint ? (
    <HoverTooltip label={label} shortcut={hint} placement="below" asChild>
      {button}
    </HoverTooltip>
  ) : (
    button
  );
}

function AddPersonButton({ disabled, onPick }: { disabled: boolean; onPick: (staffId: number) => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const directory = useActiveStaffDirectory();
  const matches = useMemo(() => {
    const q = find.trim().toLowerCase();
    return directory.filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [directory, find]);
  const pick = (id: number) => {
    onPick(id);
    setOpen(false);
    setFind('');
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-sunken px-2.5 text-[11px] font-semibold text-text-default transition-colors hover:bg-surface-hover disabled:opacity-35"
      >
        <UserPlus className="size-3.5" />
        Add person
      </button>
      <AnchoredLayer open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} placement="bottom-start" gap={6}>
        <div className="flex w-60 flex-col gap-0.5 rounded-2xl border border-border-hairline bg-surface-card p-1.5 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.45)]">
          <input
            autoFocus
            value={find}
            onChange={(event) => setFind(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && matches[0]) pick(matches[0].id);
            }}
            placeholder="Find a teammate"
            className="mb-0.5 rounded-xl bg-surface-sunken px-2.5 py-1.5 text-xs outline-none placeholder:text-text-muted"
          />
          {matches.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => pick(person.id)}
              className="flex items-center gap-2 rounded-xl px-2 py-1 text-left text-xs hover:bg-surface-hover"
            >
              <PersonDot person={person} size="xs" />
              {person.name}
            </button>
          ))}
        </div>
      </AnchoredLayer>
    </>
  );
}
