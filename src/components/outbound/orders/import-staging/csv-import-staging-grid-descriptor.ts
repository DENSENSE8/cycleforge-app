/** CSV import staging grid surface descriptor — lifts {@link CSV_IMPORT_STAGING_GRID_COLUMNS} into the TanStack defs `LedgerGridSurface`… */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { OrderImportRowView } from '@/lib/orders/order-import-descriptor';
import {
  defaultDirForCsvImportStagingColumn,
  isCsvImportStagingColumnSortable,
  type CsvImportStagingGridColumn,
} from './csv-import-staging-grid-layout';

/** Import staging — a triage queue whose whole job is picking N rows to commit. */
export const CSV_IMPORT_STAGING_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that render.
 */
export function makeCsvImportStagingGridDescriptor(
  columns: readonly CsvImportStagingGridColumn[],
): GridSurfaceDescriptor<OrderImportRowView, CsvImportStagingGridColumn> {
  return makeGridSurfaceDescriptor<OrderImportRowView, CsvImportStagingGridColumn>(
    'orders-import.staging',
    columns,
    {
      isSortable: (key) => isCsvImportStagingColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForCsvImportStagingColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`select · order`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    CSV_IMPORT_STAGING_GRID_CAPABILITIES,
  );
}
