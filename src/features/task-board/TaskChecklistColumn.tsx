'use client';

/**
 * The Daily checklist, pinned as the board's left-most column (owner
 * 2026-09-29: "removable (hide/show, remembered), with quick add"). The rows
 * are the board's own `TaskTable` rows — same gutter, same Done verb, same
 * cursor — so ticking an item here is identical to ticking it in the list.
 * A checklist manager adds an item inline (Enter); it repeats every day,
 * the New task sheet's default. `H` hides / shows the column.
 *
 * Phone: `/m/home` already lists today's checklist above the tasks.
 */

import { useState, type ComponentProps } from 'react';
import { EyeOff } from 'lucide-react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useItemActions } from '@/lib/daily-checks/use-daily-checks';
import { TASK_BOARD_TYPE_FACE, type TaskBoardRow } from '@/lib/task-board/task-board-model';
import { toast } from '@/lib/toast';
import { getCurrentPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { TaskTable } from './TaskTable';

/** Everything a `TaskTable` takes except its rows — the board passes one bundle to every column. */
export type TaskTableHandlers = Omit<ComponentProps<typeof TaskTable>, 'sections' | 'label'>;

const FACE = TASK_BOARD_TYPE_FACE.checklist;

export function TaskChecklistColumn({
  rows,
  table,
  canAdd,
  onHide,
}: {
  rows: readonly TaskBoardRow[];
  table: TaskTableHandlers;
  /** Checklist manager (`admin.manage_staff`) — the add route refuses anyone else. */
  canAdd: boolean;
  onHide: () => void;
}) {
  const done = rows.filter((row) => row.done).length;
  const Icon = FACE.icon;

  return (
    <section
      aria-label={FACE.label}
      data-testid="task-board-checklist-column"
      className="flex min-h-0 w-[320px] shrink-0 flex-col border-r border-border-hairline"
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 px-4">
        <Icon className={cn('size-3.5 shrink-0', FACE.ink)} aria-hidden />
        <h2 className="text-xs font-semibold text-text-default">{FACE.label}</h2>
        <span className="text-[11px] tabular-nums text-text-muted">
          {done}/{rows.length}
        </span>
        <HoverTooltip label="Hide the Daily checklist column" shortcut="H" placement="below" asChild>
          <button
            type="button"
            onClick={onHide}
            className="ml-auto inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-default"
          >
            <EyeOff className="size-3" aria-hidden />
            Hide
          </button>
        </HoverTooltip>
      </header>
      {canAdd ? <QuickAdd /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length > 0 ? (
          <TaskTable {...table} label={FACE.label} sections={[{ key: 'checklist', project: null, rows }]} />
        ) : (
          <p className="px-4 py-6 text-xs text-text-muted">Nothing on today’s checklist.</p>
        )}
      </div>
    </section>
  );
}

function QuickAdd() {
  const { addItem } = useItemActions(getCurrentPSTDateKey());
  const [title, setTitle] = useState('');
  const submit = () => {
    const name = title.trim();
    if (!name || addItem.isPending) return;
    addItem.mutate(
      { title: name, description: null, kind: 'recurring', glyph: null },
      {
        onSuccess: () => setTitle(''),
        onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not add to the checklist.'),
      },
    );
  };

  return (
    <div className="mx-3 mb-1 flex shrink-0 items-center gap-2 rounded-xl bg-surface-sunken px-2.5">
      <HoverTooltip label="Add to the checklist" shortcut="Enter" placement="below" focusable={false} asChild>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            } else if (event.key === 'Escape' && title === '') {
              event.currentTarget.blur();
            }
          }}
          disabled={addItem.isPending}
          aria-label="Add to the daily checklist"
          placeholder="Add to the checklist — every day"
          data-testid="task-board-checklist-add"
          className="h-8 min-w-0 flex-1 bg-transparent text-xs text-text-default outline-none placeholder:text-text-muted"
        />
      </HoverTooltip>
    </div>
  );
}
