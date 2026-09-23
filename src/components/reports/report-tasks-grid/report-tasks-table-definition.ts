/**
 * `reports.tasks` — the completed-tasks table definition, capabilities and
 * surface descriptor.
 *
 * Re-declares nothing: the column model, the sort law and the default
 * direction are the ENGINE's (`slot-table-columns.ts`) read through this
 * family's record, and the canonical columns are the product-default
 * MATERIALIZATION — never a hand array, and no per-family copy of the
 * materializer either (`SLOT_TABLE_COLUMN_MODULE_DEBT` is shrink-only).
 *
 * Its OWN tableId, never the working desk's `tasks`: the Fields menu keys off
 * `tableId`, so hiding `Deadline` on this report must not densify the desk a
 * staffer works their open queue on. Same reading as `report-packer-day`
 * beside the `packer` bench history — one activity, two documents, because one
 * is the queue and the other is the record.
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
import {
  REPORT_TASKS_FAMILY,
  REPORT_TASKS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/report-tasks';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const REPORT_TASKS_COMPOUND_COLUMNS: readonly SlotTableColumn[] = slotTableColumnsFor(
  REPORT_TASKS_FAMILY,
  REPORT_TASKS_PRODUCT_LAYOUT,
);

/**
 * Nothing on this report writes. Reopening a finished task is a verb of the
 * task DESK (`PATCH /api/tasks/<id>`), where the row is still work; here the
 * row is a record, so there is no row verb and no cell editor.
 *
 * `multiSelect` stays on for the bulk copy-TSV bar every slot peer carries:
 * lifting a week of one staffer's finished work into a review is the reason
 * this tab is opened at all.
 */
export const REPORT_TASKS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render. `columns` is REQUIRED: a module-constant default is the
 * `grid-default` debt the discover scanner deletes.
 */
export function makeReportTasksGridDescriptor(
  columns: readonly SlotTableColumn[],
): GridSurfaceDescriptor<TaskDeskRow, SlotTableColumn> {
  return makeGridSurfaceDescriptor<TaskDeskRow, SlotTableColumn>(
    'reports.tasks',
    columns,
    {
      isSortable: (key) => isSlotTableColumnSortable(REPORT_TASKS_FAMILY, columns, key),
      sortDescFirst: (key) =>
        defaultDirForSlotTableColumn(REPORT_TASKS_FAMILY, columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    REPORT_TASKS_GRID_CAPABILITIES,
  );
}

export const REPORT_TASKS_TABLE_DEFINITION = parseTableDefinition({
  id: 'reports.tasks',
  tableId: 'report-tasks',
  entityFamily: 'report-tasks',
  cellMapKey: 'report-tasks',
  ariaLabel: 'Completed tasks',
  testId: 'report-tasks-grid-body',
  surface: 'sheet',
  // The stamp on the row is a COMPLETION date spread over whatever window the
  // route returned; a sticky band per day would be one band per handful of rows.
  showDayHeaders: false,
  capabilities: REPORT_TASKS_GRID_CAPABILITIES,
  columns: REPORT_TASKS_COMPOUND_COLUMNS,
});

export const REPORT_TASKS_TABLE_BINDING: TableSurfaceBinding<TaskDeskRow, SlotTableColumn> = {
  definition: REPORT_TASKS_TABLE_DEFINITION,
  columns: REPORT_TASKS_COMPOUND_COLUMNS,
  makeDescriptor: makeReportTasksGridDescriptor,
  /**
   * HONEST ABSENCE, ruled rather than defaulted. A finished task's own detail
   * plane is the task desk's inspector, which exists to CHANGE the row —
   * reassign it, move its deadline, reopen it — and none of those verbs belong
   * on a record. What an operator wants from a row here is the thing the task
   * was about, and the title already opens it (`taskDeskRecordHref`).
   */
  recordPlane: {
    kind: 'none',
    reason:
      'A read-only record of finished work. The task desk owns the inspector because the inspector exists to change the row; the record this task was about is one click away on the row title.',
  },
};
