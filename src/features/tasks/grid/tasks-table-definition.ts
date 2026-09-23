/**
 * `tasks.mine` — the task desk (`work_assignments`, `work_type = 'FOLLOW_UP'`)
 * table definition, capabilities and descriptor.
 *
 * Re-declares nothing: the columns come from the ENGINE
 * (`slotTableColumnsFor`) applied to {@link TASKS_FAMILY}, and sortability
 * from the same record. The family used to own a `tasks-grid-layout.ts` plus a
 * `useTasksTableLayout.ts` — 200 lines restating the engine's column law to
 * supply four strings — and both are deleted with the store swap.
 *
 * `recordPlane` names the right-rail occupant a row click opens, so "click the
 * line item → details on the right" is a property of the REGISTERED definition
 * rather than of one page's click handler.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  defaultDirForSlotTableColumn,
  isSlotTableColumnSortable,
  slotTableColumnsFor,
  type SlotTableColumn,
} from '@/components/tables/compound/slot-table-columns';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { TASKS_FAMILY, TASKS_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/tasks';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { TASK_INSPECTOR_RAIL_ID } from './task-inspector-id';

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const TASKS_COMPOUND_COLUMNS: readonly SlotTableColumn[] = slotTableColumnsFor(
  TASKS_FAMILY,
  TASKS_PRODUCT_LAYOUT,
);

/**
 * The task desk is a QUEUE of handed-over work, and the capability bag says so.
 *
 * `multiSelect: true` — a task row is not a checkbox to tick. Marking work
 * done, re-prioritising it or handing it on are STATUS writes, and they arrive
 * in batches ("everything I finished this afternoon"), so the gutter is a
 * selection feeding the action strip rather than a one-row verb. This is the
 * one capability that flipped with the store swap: `staff_todos` was a
 * personal checklist where the tick WAS the verb; `work_assignments` is a
 * ledger of assignments where the verb is a transition.
 *
 * `inCellEdit: false` — the row is a pointer at a record. Re-wording a handoff
 * happens in the right-rail inspector, which is where the task's other facts
 * (record, ticket, history) already are. A cell editor here would be a second
 * write path competing with the record plane.
 */
export const TASKS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so a
 * header's sortability is answered against the tracks actually mounted.
 */
export function makeTasksGridDescriptor(
  columns: readonly SlotTableColumn[],
): GridSurfaceDescriptor<TaskDeskRow, SlotTableColumn> {
  return makeGridSurfaceDescriptor<TaskDeskRow, SlotTableColumn>(
    'tasks.mine',
    columns,
    {
      isSortable: (key) => isSlotTableColumnSortable(TASKS_FAMILY, columns, key),
      sortDescFirst: (key) =>
        defaultDirForSlotTableColumn(TASKS_FAMILY, columns, key) === 'desc',
    },
    TASKS_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
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

export const TASKS_TABLE_BINDING: TableSurfaceBinding<TaskDeskRow, SlotTableColumn> = {
  definition: TASKS_TABLE_DEFINITION,
  columns: TASKS_COMPOUND_COLUMNS,
  makeDescriptor: makeTasksGridDescriptor,
  recordPlane: { kind: 'inspector', occupantId: TASK_INSPECTOR_RAIL_ID },
};
