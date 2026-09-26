/** `inventory.units` — Inventory › Units browse table definition. */

import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { UNITS_SHEET_COLUMNS, type UnitsGridColumn } from './units-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { UNITS_GRID_CAPABILITIES, makeUnitsGridDescriptor } from './units-grid-descriptor';

export const UNITS_TABLE_DEFINITION = parseTableDefinition({
  id: 'inventory.units',
  tableId: 'inventory-units',
  entityFamily: 'units',
  cellMapKey: 'units',
  ariaLabel: 'Inventory units',
  testId: 'inventory-units-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: UNITS_GRID_CAPABILITIES,
  columns: UNITS_SHEET_COLUMNS,
});

export const UNITS_TABLE_BINDING: TableSurfaceBinding<UnitsOverviewRow, UnitsGridColumn> = {
  definition: UNITS_TABLE_DEFINITION,
  columns: UNITS_SHEET_COLUMNS,
  makeDescriptor: makeUnitsGridDescriptor,
  // The push inspector, keyed per RECORD (`?open=unit:<ref>`).
  recordPlane: {
    kind: 'inspector',
    occupantId: 'detail:unit',
    keyedByRecord:
      'Unit browse has no prev/next walk — one unit is opened, read and closed.',
  },
};
