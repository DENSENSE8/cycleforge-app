/** `sales.walk-in` — Sales-board history table definition. */

import type { SaleRow } from '@/lib/walk-in/transactions';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { WALKINSALES_COMPOUND_COLUMNS, type WalkInSalesGridColumn } from './walk-in-sales-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  WALKINSALES_GRID_CAPABILITIES,
  makeWalkInSalesGridDescriptor,
} from './walk-in-sales-grid-descriptor';

const WALKINSALES_TABLE_DEFINITION = parseTableDefinition({
  id: 'sales.walk-in',
  tableId: 'walk-in-sales',
  entityFamily: 'walk-in-sales',
  cellMapKey: 'walk-in-sales',
  ariaLabel: 'Walk-in sales',
  testId: 'walk-in-sales-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: WALKINSALES_GRID_CAPABILITIES,
  columns: WALKINSALES_COMPOUND_COLUMNS,
});

export const WALKINSALES_TABLE_BINDING: TableSurfaceBinding<SaleRow, WalkInSalesGridColumn> = {
  definition: WALKINSALES_TABLE_DEFINITION,
  columns: WALKINSALES_COMPOUND_COLUMNS,
  makeDescriptor: makeWalkInSalesGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'A completed visit is a history fact on this board — receipt print stays on the kiosk/counter paperwork plane, not a second record editor here.',
  },
};
