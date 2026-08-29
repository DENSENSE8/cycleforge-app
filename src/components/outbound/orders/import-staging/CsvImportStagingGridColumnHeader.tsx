'use client';

import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  CSV_IMPORT_STAGING_GRID_COLUMNS,
  isCsvImportStagingGridSortable,
  type CsvImportStagingGridColumn,
  type CsvImportStagingGridColumnKey,
} from './csv-import-staging-grid-layout';

/**
 * The six per-family layout fields this carried were family-flavoured aliases of
 * the same shared functions; `LedgerHeaderLayoutApi` collapsed them. What is
 * genuinely per-family is which columns sort and where the frozen edge sits.
 */
const CSV_IMPORT_STAGING_HEADER_LAYOUT: LedgerHeaderLayoutApi = {
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
