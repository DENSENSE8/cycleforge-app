/**
 * `orders-import.staging` — the To-Ship CSV import staging table definition.
 *
 * Its own `entityFamily` / prefs bucket rather than `orders`: a staging row is
 * a parsed CSV record with a triage state, not a live order, and hiding a
 * column here must never change the density of the live To-Ship queue an
 * operator is about to import into.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import type { OrderImportRowView } from '@/lib/orders/order-import-descriptor';
import {
  CSV_IMPORT_STAGING_GRID_COLUMNS,
  type CsvImportStagingGridColumn,
} from './csv-import-staging-grid-layout';
import {
  CSV_IMPORT_STAGING_GRID_CAPABILITIES,
  makeCsvImportStagingGridDescriptor,
} from './csv-import-staging-grid-descriptor';

export const CSV_IMPORT_STAGING_TABLE_DEFINITION = parseTableDefinition({
  id: 'orders-import.staging',
  tableId: 'orders-import',
  entityFamily: 'orders-import',
  cellMapKey: 'orders-import',
  ariaLabel: 'CSV import staging rows',
  testId: 'csv-import-staging-grid',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: CSV_IMPORT_STAGING_GRID_CAPABILITIES,
  columns: CSV_IMPORT_STAGING_GRID_COLUMNS,
});

export const CSV_IMPORT_STAGING_TABLE_BINDING: TableSurfaceBinding<
  OrderImportRowView,
  CsvImportStagingGridColumn
> = {
  definition: CSV_IMPORT_STAGING_TABLE_DEFINITION,
  columns: CSV_IMPORT_STAGING_GRID_COLUMNS,
  makeDescriptor: makeCsvImportStagingGridDescriptor,
};
