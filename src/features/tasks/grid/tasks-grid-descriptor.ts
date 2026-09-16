import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid/grid-surface-descriptor';
import {
  tasksSortFactFor,
  defaultDirForTasksGridSort,
  type TasksGridColumn,
} from '@/lib/staff-todos/tasks-grid-layout';
import type { StaffTaskRow } from './staff-task-row';

/**
 * My Tasks is a CHECKLIST that one person owns, and the capability bag says so:
 *
 * `multiSelect: false` — the gutter checkbox is the surface's primary VERB
 * (check the task off), not a selection. Declaring multi-select would mount the
 * select-all wiring on top of it and give one control two meanings. Same
 * reading as Daily.
 *
 * `inCellEdit: false` — the row is a pointer at a record; renaming happens in
 * the right-rail inspector, which is where the task's other facts (kind, cycle,
 * station, history) are. A cell editor here would be a second rename path
 * competing with the record plane.
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
): GridSurfaceDescriptor<StaffTaskRow, TasksGridColumn> {
  return makeGridSurfaceDescriptor<StaffTaskRow, TasksGridColumn>(
    'tasks.mine',
    visible,
    {
      // Sortability is a property of the BOUND FACT, not of the track: a
      // staffer's task has no order and no price, so the compound
      // `fulfillment` / `amount` tracks carry nothing to order by. Passing
      // `undefined` here let the header offer a sort the desk could not
      // perform — a click that moved a caret and reordered nothing.
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
