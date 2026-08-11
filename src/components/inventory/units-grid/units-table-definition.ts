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
  // `detail:inventory-<kind>` — keyed on the record KIND, not the record, so a
  // same-kind ref change swaps the node in place (see InventoryInspectorRail).
  recordPlane: { kind: 'inspector', occupantId: 'detail:inventory-unit' },
};
