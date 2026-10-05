'use client';

/**
 * Wide triage (`?layout=columns`, owner 2026-09-29: "several task columns side
 * by side, horizontal scroll, complete inline"). One column per type —
 * Tasks · Projects — on the shared {@link ColumnBoard}.
 * Each column is a `TaskTable`, so Done, Reply, select and the cursor behave
 * exactly as in the list, and J / K walk the columns in reading order.
 *
 * Phone: one column at a time is the list itself — `/m/home` stays the path.
 */

import { ColumnBoard, ColumnBoardColumn, ColumnBoardEmpty } from '@/design-system/components/column-board/ColumnBoard';
import { TASK_BOARD_TYPE_FACE, isTaskBoardOpen } from '@/lib/task-board/task-board-model';
import { cn } from '@/utils/_cn';
import { TaskTable } from './TaskTable';
import type { TaskTableHandlers } from './TaskChecklistColumn';
import type { TaskBoardColumn } from './useTaskBoard';

export function TaskBoardColumns({ columns, table }: { columns: readonly TaskBoardColumn[]; table: TaskTableHandlers }) {
  return (
    <ColumnBoard testId="task-board-columns">
      {columns.map((column) => {
        const face = TASK_BOARD_TYPE_FACE[column.type];
        const Icon = face.icon;
        return (
          <ColumnBoardColumn
            key={column.type}
            id={column.type}
            label={column.label}
            count={column.rows.filter(isTaskBoardOpen).length}
            countLabel="open"
            icon={<Icon className={cn('size-3.5 shrink-0', face.ink)} aria-hidden />}
            testId="task-board-column"
          >
            {column.rows.length > 0 ? (
              <TaskTable {...table} label={column.label} sections={[{ key: column.type, type: column.type, project: null, rows: column.rows }]} />
            ) : (
              <ColumnBoardEmpty />
            )}
          </ColumnBoardColumn>
        );
      })}
    </ColumnBoard>
  );
}
