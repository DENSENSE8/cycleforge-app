import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid/grid-surface-descriptor';
import {
  TASKS_GRID_COLUMNS,
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
    undefined,
    TASKS_GRID_CAPABILITIES,
  );
}

export { TASKS_GRID_COLUMNS };
