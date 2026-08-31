/**
 * CSV import staging grid surface descriptor — lifts
 * {@link CSV_IMPORT_STAGING_GRID_COLUMNS} into the TanStack defs
 * `LedgerGridSurface` mounts. Row ORDER stays with the host comparator (state
 * math only); the rows themselves are a session draft, never a query.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { OrderImportRowView } from '@/lib/orders/order-import-descriptor';
import {
  defaultDirForCsvImportStagingGridSort,
  isCsvImportStagingGridFrozen,
  isCsvImportStagingGridSortable,
  type CsvImportStagingGridColumn,
} from './csv-import-staging-grid-layout';

/**
 * Import staging — a triage queue whose whole job is picking N rows to commit.
 *
 * `multiSelect: true` is the load-bearing flag: Confirm acts on the selection ∩
 * Ready. `inCellEdit: false` — a value is corrected on the rail's Row leaf (all
 * six fields at once, with the missing-field reason) or by re-mapping the source
 * column; the cell shows what was parsed and does not pretend to accept a value.
 * `rowTriageFlags: false`: the `status` track already carries this surface's one
 * state, and a staff row colour beside it would be a second story about the same
 * row.
 */
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
      isSortable: isCsvImportStagingGridSortable,
      sortDescFirst: (key) => defaultDirForCsvImportStagingGridSort(key) === 'desc',
      isLocked: isCsvImportStagingGridFrozen,
    },
    CSV_IMPORT_STAGING_GRID_CAPABILITIES,
  );
}
