import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  SKU_VELOCITY_COMPOUND_COLUMNS,
  type SkuVelocityGridColumn,
} from '@/lib/reports/sku-velocity-grid-layout';
import {
  SKU_VELOCITY_GRID_CAPABILITIES,
  makeSkuVelocityGridDescriptor,
} from './sku-velocity-grid-descriptor';
import type { SkuVelocityRow } from '@/features/reports/metrics/report-rows';

export const SKU_VELOCITY_TABLE_DEFINITION = parseTableDefinition({
  id: 'reports.sku-velocity',
  tableId: 'sku-velocity',
  entityFamily: 'sku-velocity',
  cellMapKey: 'sku-velocity',
  ariaLabel: 'SKU velocity',
  testId: 'sku-velocity-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: SKU_VELOCITY_GRID_CAPABILITIES,
  columns: SKU_VELOCITY_COMPOUND_COLUMNS,
});

export const SKU_VELOCITY_TABLE_BINDING: TableSurfaceBinding<
  SkuVelocityRow,
  SkuVelocityGridColumn
> = {
  definition: SKU_VELOCITY_TABLE_DEFINITION,
  columns: SKU_VELOCITY_COMPOUND_COLUMNS,
  makeDescriptor: makeSkuVelocityGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason: 'A velocity ranking is fully expressed by its row — there is no SKU record overlay on Reports.',
  },
};
