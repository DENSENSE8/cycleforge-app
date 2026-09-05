import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  DEAD_STOCK_COMPOUND_COLUMNS,
  type DeadStockGridColumn,
} from '@/lib/reports/dead-stock-grid-layout';
import {
  DEAD_STOCK_GRID_CAPABILITIES,
  makeDeadStockGridDescriptor,
} from './dead-stock-grid-descriptor';
import type { DeadStockRow } from '@/features/reports/metrics/report-rows';

export const DEAD_STOCK_TABLE_DEFINITION = parseTableDefinition({
  id: 'reports.dead-stock',
  tableId: 'dead-stock',
  entityFamily: 'dead-stock',
  cellMapKey: 'dead-stock',
  ariaLabel: 'Dead stock',
  testId: 'dead-stock-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: DEAD_STOCK_GRID_CAPABILITIES,
  columns: DEAD_STOCK_COMPOUND_COLUMNS,
});

export const DEAD_STOCK_TABLE_BINDING: TableSurfaceBinding<DeadStockRow, DeadStockGridColumn> = {
  definition: DEAD_STOCK_TABLE_DEFINITION,
  columns: DEAD_STOCK_COMPOUND_COLUMNS,
  makeDescriptor: makeDeadStockGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason: 'A dormancy ranking is fully expressed by its row — there is no SKU record overlay on Reports.',
  },
};
