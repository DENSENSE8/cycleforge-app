/** `orders-import.staging` — the To-Ship CSV import staging table definition. */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import type { OrderImportRowView } from '@/lib/orders/order-import-descriptor';
import {
  CSV_IMPORT_STAGING_SHEET_COLUMNS,
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
  columns: CSV_IMPORT_STAGING_SHEET_COLUMNS,
});

export const CSV_IMPORT_STAGING_TABLE_BINDING: TableSurfaceBinding<
  OrderImportRowView,
  CsvImportStagingGridColumn
> = {
  definition: CSV_IMPORT_STAGING_TABLE_DEFINITION,
  columns: CSV_IMPORT_STAGING_SHEET_COLUMNS,
  makeDescriptor: makeCsvImportStagingGridDescriptor,
  recordPlane: { kind: 'inspector', occupantId: 'detail:order-import-staging' },
};
