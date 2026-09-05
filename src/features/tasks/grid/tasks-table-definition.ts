/**
 * `tasks.mine` — Home → Tasks table definition.
 *
 * Rows are org `ops_plan_tasks`. The id stays `tasks.mine` so the registered
 * family does not fork. Record plane is Center Lock L2: row click opens the
 * project on `DeskStageOverlay`; gutter Morphing stays the row verbs.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import type { TaskRow } from '@/lib/ops-plans/types';
import {
  TASKS_COMPOUND_COLUMNS,
  type TasksGridColumn,
} from '@/lib/staff-todos/tasks-grid-layout';
import { TASKS_GRID_CAPABILITIES, makeTasksGridDescriptor } from './tasks-grid-descriptor';

export const TASKS_TABLE_DEFINITION = parseTableDefinition({
  id: 'tasks.mine',
  tableId: 'tasks',
  entityFamily: 'tasks',
  cellMapKey: 'tasks',
  ariaLabel: 'Tasks',
  testId: 'tasks-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: TASKS_GRID_CAPABILITIES,
  columns: TASKS_COMPOUND_COLUMNS,
});

export const TASKS_TABLE_BINDING: TableSurfaceBinding<TaskRow, TasksGridColumn> = {
  definition: TASKS_TABLE_DEFINITION,
  columns: TASKS_COMPOUND_COLUMNS,
  makeDescriptor: makeTasksGridDescriptor,
  recordPlane: {
    kind: 'stage-overlay',
    reason: 'Home Tasks row click opens the project on DeskStageOverlay; gutter Morphing stays the verbs',
  },
};
