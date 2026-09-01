/**
 * `tasks.mine` — the My Tasks (`staff_todos`) table definition.
 *
 * Re-declares nothing: columns and capabilities are the family SoT by
 * reference. `recordPlane` names the right-rail occupant a row click opens, so
 * "click the line item → details on the right" is a property of the REGISTERED
 * definition rather than of one page's click handler.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  TASKS_COMPOUND_COLUMNS,
  type TasksGridColumn,
} from '@/lib/staff-todos/tasks-grid-layout';
import { TASKS_GRID_CAPABILITIES, makeTasksGridDescriptor } from './tasks-grid-descriptor';
import type { StaffTaskRow } from './staff-task-row';

export const TASKS_TABLE_DEFINITION = parseTableDefinition({
  id: 'tasks.mine',
  tableId: 'tasks',
  entityFamily: 'tasks',
  cellMapKey: 'tasks',
  ariaLabel: 'My tasks',
  testId: 'tasks-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: TASKS_GRID_CAPABILITIES,
  columns: TASKS_COMPOUND_COLUMNS,
});

export const TASKS_TABLE_BINDING: TableSurfaceBinding<StaffTaskRow, TasksGridColumn> = {
  definition: TASKS_TABLE_DEFINITION,
  columns: TASKS_COMPOUND_COLUMNS,
  makeDescriptor: makeTasksGridDescriptor,
  recordPlane: { kind: 'inspector', occupantId: 'detail:staff-task' },
};
