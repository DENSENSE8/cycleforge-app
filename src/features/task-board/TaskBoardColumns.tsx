'use client';

/**
 * Wide triage (`?layout=columns`, owner 2026-09-29: "several task columns side
 * by side, horizontal scroll, complete inline"). One column per type —
 * Support tickets · Tasks · Projects — in a horizontal strip that snaps to
 * column edges. Shift + wheel is the platform's own horizontal scroll; the
 * strip never listens to the wheel. Each column is a `TaskTable`, so Done,
 * Reply, select and the cursor behave exactly as in the list, and J / K walk
 * the columns in reading order.
 *
 * Phone: one column at a time is the list itself — `/m/home` stays the path.
 */

import { TASK_BOARD_TYPE_FACE, isTaskBoardOpen } from '@/lib/task-board/task-board-model';
import { cn } from '@/utils/_cn';
import { TaskTable } from './TaskTable';
import type { TaskTableHandlers } from './TaskChecklistColumn';
import type { TaskBoardColumn } from './useTaskBoard';

export function TaskBoardColumns({ columns, table }: { columns: readonly TaskBoardColumn[]; table: TaskTableHandlers }) {
  return (
    <div
      data-testid="task-board-columns"
      className="flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
    >
      {columns.map((column) => {
        const face = TASK_BOARD_TYPE_FACE[column.type];
        const Icon = face.icon;
        const open = column.rows.filter(isTaskBoardOpen).length;
        return (
          <section
            key={column.type}
            aria-label={column.label}
            data-testid="task-board-column"
            data-column={column.type}
            className="flex min-h-0 min-w-[340px] flex-1 basis-0 snap-start flex-col border-r border-border-hairline last:border-r-0"
          >
            <header className="flex h-9 shrink-0 items-center gap-1.5 px-4">
              <Icon className={cn('size-3.5 shrink-0', face.ink)} aria-hidden />
              <h2 className="text-xs font-semibold text-text-default">{column.label}</h2>
              <span className="text-[11px] tabular-nums text-text-muted">{open} open</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {column.rows.length > 0 ? (
                <TaskTable {...table} label={column.label} sections={[{ key: column.type, project: null, rows: column.rows }]} />
              ) : (
                <p className="px-4 py-6 text-xs text-text-muted">Nothing here.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
