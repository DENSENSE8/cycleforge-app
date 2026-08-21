'use client';

import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  TASKS_GRID_COLUMNS,
  TASKS_GRID_FROZEN_CELL,
  tasksGridCell,
  tasksGridFrozenLeft,
  tasksGridRowShellClass,
  tasksGridTemplate,
  isTasksGridFrozen,
  isTasksGridSortable,
  type TasksGridColumn,
  type TasksGridColumnKey,
} from '@/lib/staff-todos/tasks-grid-layout';

const TASKS_HEADER_LAYOUT: LedgerHeaderLayoutApi<TasksGridColumn> = {
  template: tasksGridTemplate,
  cellClass: tasksGridCell,
  rowShellClass: tasksGridRowShellClass,
  frozenCellClass: TASKS_GRID_FROZEN_CELL,
  frozenLeft: tasksGridFrozenLeft,
  isFrozen: isTasksGridFrozen,
  isSortable: isTasksGridSortable,
};

/** Sticky column header for the My Tasks grid — the shared factory, no twin. */
export const TasksGridColumnHeader = makeLedgerGridColumnHeader<
  TasksGridColumn,
  TasksGridColumnKey,
  'prop'
>({
  layout: TASKS_HEADER_LAYOUT,
  defaultColumns: TASKS_GRID_COLUMNS,
  selectMode: 'prop',
  tableId: 'tasks',
});
