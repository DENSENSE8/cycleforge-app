/**
 * `inventory.units` — Inventory › Units browse table definition.
 *
 * The units collection for the `/inventory` ops-queue golden (five-row Sheets),
 * sibling of `warehouse.bins`. Columns + capabilities are the family SoT by
 * reference; the definition carries the single truth for the shell recipe
 * (`surface: 'sheet'`), the prefs bucket (`tableId`) and the accessible name.
 *
 * Frozen pane = `serial` (the unit's own scannable handle). Browse-only — no
 * select gutter until bulk unit actions land.
 */

import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { UNITS_GRID_COLUMNS, type UnitsGridColumn } from './units-grid-layout';
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
  columns: UNITS_GRID_COLUMNS,
});

export const UNITS_TABLE_BINDING: TableSurfaceBinding<UnitsOverviewRow, UnitsGridColumn> = {
  definition: UNITS_TABLE_DEFINITION,
  columns: UNITS_GRID_COLUMNS,
  makeDescriptor: makeUnitsGridDescriptor,
  // The push inspector, keyed per RECORD (`?open=unit:<ref>`). Keyed by record
  // because a unit browse has no queue walk — an operator opens one unit, reads
  // it, and closes it, so the AnimatePresence re-key that would flash on every
  // prev/next step never happens here.
  recordPlane: {
    kind: 'inspector',
    occupantId: 'detail:unit',
    keyedByRecord:
      'Unit browse has no prev/next walk — one unit is opened, read and closed.',
  },
};
