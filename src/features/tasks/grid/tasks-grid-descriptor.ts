import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid/grid-surface-descriptor';
import {
  TASKS_COMPOUND_COLUMNS,
  tasksSortFactFor,
  defaultDirForTasksGridSort,
  type TasksGridColumn,
} from '@/lib/staff-todos/tasks-grid-layout';
import type { TaskRow } from '@/lib/ops-plans/types';

/**
 * Home Tasks is a triage sheet. `multiSelect: false` — the gutter checkbox
 * selects the row and opens Morphing (To-ship grammar), never bulk-select.
 * `inCellEdit: false` — status/assign/ping live on Morphing, not a second editor.
 */
export const TASKS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeTasksGridDescriptor(
  visible: readonly TasksGridColumn[],
): GridSurfaceDescriptor<TaskRow, TasksGridColumn> {
  return makeGridSurfaceDescriptor<TaskRow, TasksGridColumn>(
    'tasks.mine',
    visible,
    {
      isSortable: (key) => {
        const col = visible.find((c) => c.key === key);
        return col ? tasksSortFactFor(col) != null : false;
      },
      sortDescFirst: (key) => {
        const col = visible.find((c) => c.key === key);
        const fact = col ? tasksSortFactFor(col) : null;
        return fact ? defaultDirForTasksGridSort(fact) === 'desc' : false;
      },
    },
    TASKS_GRID_CAPABILITIES,
  );
}

export { TASKS_COMPOUND_COLUMNS };
