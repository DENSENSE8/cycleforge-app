/** `tasks.mine` — the task desk (`work_assignments`, `work_type = 'FOLLOW_UP'`) table definition, capabilities and descriptor. */

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

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const TASKS_COMPOUND_COLUMNS: readonly SlotTableColumn[] = slotTableColumnsFor(
  TASKS_FAMILY,
  TASKS_PRODUCT_LAYOUT,
);

/** The task desk is a QUEUE of handed-over work, and the capability bag says so. */
const TASKS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
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
function makeTasksGridDescriptor(
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
const TASKS_TABLE_DEFINITION = parseTableDefinition({
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
  recordPlane: {
    kind: 'stage-overlay',
    reason: 'A task opens on Daily (`/?task=`) through RecordLedger → DeskRecordPlane: in place of the list, or split beside it in fullscreen.',
  },
};
