'use client';

import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  CSV_IMPORT_STAGING_GRID_COLUMNS,
  CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
  csvImportStagingGridCell,
  csvImportStagingGridFrozenLeft,
  csvImportStagingGridRowShellClass,
  csvImportStagingGridTemplate,
  isCsvImportStagingGridFrozen,
  isCsvImportStagingGridSortable,
  type CsvImportStagingGridColumn,
  type CsvImportStagingGridColumnKey,
} from './csv-import-staging-grid-layout';

const CSV_IMPORT_STAGING_HEADER_LAYOUT: LedgerHeaderLayoutApi<CsvImportStagingGridColumn> = {
  template: csvImportStagingGridTemplate,
  cellClass: csvImportStagingGridCell,
  rowShellClass: csvImportStagingGridRowShellClass,
  frozenCellClass: CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
  frozenLeft: (key) => csvImportStagingGridFrozenLeft(key as CsvImportStagingGridColumnKey),
  isFrozen: isCsvImportStagingGridFrozen,
  isSortable: isCsvImportStagingGridSortable,
  frozenEdgeKey: 'order',
};

/**
 * Sticky column header for the CSV staging LedgerGrid. `selectMode: 'always'`
 * — the surface exists to pick rows to commit, so select-all is never a mode
 * the caller has to remember to turn on.
 */
export const CsvImportStagingGridColumnHeader = makeLedgerGridColumnHeader<
  CsvImportStagingGridColumn,
  CsvImportStagingGridColumnKey,
  'always'
>({
  layout: CSV_IMPORT_STAGING_HEADER_LAYOUT,
  defaultColumns: CSV_IMPORT_STAGING_GRID_COLUMNS,
  tableId: 'orders-import',
  selectMode: 'always',
});
