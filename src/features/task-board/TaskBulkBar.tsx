'use client';

/**
 * The list's top strip. Idle: the select-all box, Open · Waiting · Done · All and the
 * project in focus on the left; WHOSE work — Mine · Handed off · Everyone —
 * dead centre for triage (owner 2026-09-29, moved out of the sidebar), never
 * overlapped; on the right the tally, then List · Columns (`V`) and the
 * checklist column switch (`H`) as icons (hover names them). With a
 * selection it becomes the bulk verbs — Done, Reopen, Urgent,
 * Due today, Add person — over exactly the selected rows (a checklist item
 * takes Done / Reopen only).
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarClock, CircleCheck, Columns3, List, ListChecks, RotateCcw, UserPlus, X, type LucideIcon } from 'lucide-react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button as ChromeButton } from '@/components/ui/button';
import { Zap } from '@/components/Icons';
import { AnimatePresence, motion } from '@/design-system/motion';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { KeyboardKey } from '@/design-system/primitives';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { useActiveStaffDirectory } from '@/components/sidebar/hooks';
import type { TaskBoardStatus } from '@/lib/task-board/task-board-model';
import { TASK_STATUS_FACE } from '@/design-system/tokens/task-status';
import type { TaskDeskScope } from '@/features/tasks/useTaskDesk';
import type { TaskBoardLayout } from './useTaskBoard';
import { cn } from '@/utils/_cn';
import { PersonDot } from './task-board-atoms';

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
  error: string | null;
}) {
  const selecting = selectedCount > 0;
  const all = selecting && selectedCount === totalCount;

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-hairline px-3" data-testid="task-board-toolbar">
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
            <button
              type="button"
              onClick={onClear}
              className="ml-auto inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-default"
            >
              <X className="size-3" />
              Clear
              <KeyboardKey size="xs">Esc</KeyboardKey>
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="filters"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
          >
            {/* overflow-hidden on both flanks: whatever the width, neither can reach the centred scope. */}
            <span className="flex min-w-0 items-center gap-2 overflow-hidden">
              <Segmented label="Status" layoutId="task-board-status" options={STATUS_OPTIONS} value={status} onChange={onStatus} />
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
            <Segmented label="Whose work" layoutId="task-board-scope" options={SCOPE_OPTIONS} value={scope} onChange={onScope} />
            <span className="flex min-w-0 items-center justify-end gap-3 overflow-hidden whitespace-nowrap text-[11px] tabular-nums text-text-muted">
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

/** One sunken pill track; the current option rides a sliding card. An option with an icon paints only the icon; the hover names it. */
function Segmented<T extends string>({
  label,
  layoutId,
  options,
  value,
  onChange,
  shortcut,
}: {
  label: string;
  layoutId: string;
  options: readonly { id: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
  /** The key that cycles the options — shown in each icon option's hover. */
  shortcut?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-flex shrink-0 rounded-full bg-surface-sunken p-0.5">
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-colors disabled:opacity-35',
        tone === 'done'
          ? 'bg-emerald-700 pr-1 text-white shadow-sm shadow-emerald-700/30 hover:bg-emerald-800'
          : 'bg-surface-sunken text-text-default hover:bg-surface-hover',
      )}
    >
      {icon}
      {label}
      {hint ? (
        <KeyboardKey size="xs" tone={tone === 'done' ? 'inverse' : 'default'}>
          {hint}
        </KeyboardKey>
      ) : null}
    </button>
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
