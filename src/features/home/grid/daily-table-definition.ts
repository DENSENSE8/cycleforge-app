/** `home.daily` — the Home → Daily AGENDA table definition. */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  defaultDirForDataTableCompoundColumn,
  isDataTableCompoundColumnSortable,
  dataTableCompoundColumnsFor,
  type DataTableCompoundColumn,
} from '@/components/tables/compound/data-table-compound-columns';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { DAILY_FAMILY, DAILY_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/daily';
import type { DailyAgendaRow } from '@/lib/daily/daily-agenda-row';

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const DAILY_COMPOUND_COLUMNS: readonly DataTableCompoundColumn[] = dataTableCompoundColumnsFor(
  DAILY_FAMILY,
  DAILY_PRODUCT_LAYOUT,
);

/** Daily is a CHECKLIST — on BOTH halves — and the capability bag says so: */
const DAILY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  dayBands: false,
};

/** Build the descriptor from a RESOLVED column list (post-visibility), so a header's sortability is answered against the tracks actually… */
function makeDailyGridDescriptor(
  columns: readonly DataTableCompoundColumn[],
): GridSurfaceDescriptor<DailyAgendaRow, DataTableCompoundColumn> {
  return makeGridSurfaceDescriptor<DailyAgendaRow, DataTableCompoundColumn>(
    'home.daily',
    columns,
    {
      isSortable: (key) => isDataTableCompoundColumnSortable(DAILY_FAMILY, columns, key),
      sortDescFirst: (key) =>
        defaultDirForDataTableCompoundColumn(DAILY_FAMILY, columns, key) === 'desc',
    },
    DAILY_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
const DAILY_TABLE_DEFINITION = parseTableDefinition({
  id: 'home.daily',
  tableId: 'daily',
  entityFamily: 'daily',
  cellMapKey: 'daily',
  ariaLabel: 'Daily agenda',
  testId: 'daily-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: DAILY_GRID_CAPABILITIES,
  columns: DAILY_COMPOUND_COLUMNS,
});

export const DAILY_TABLE_BINDING: TableSurfaceBinding<DailyAgendaRow, DataTableCompoundColumn> = {
  definition: DAILY_TABLE_DEFINITION,
  columns: DAILY_COMPOUND_COLUMNS,
  makeDescriptor: makeDailyGridDescriptor,
  recordPlane: {
    kind: 'stage-overlay',
    reason: 'Daily (`/`) opens a task or checklist item through RecordLedger → DeskRecordPlane: in place of the list, or split beside it in fullscreen.',
  },
};
