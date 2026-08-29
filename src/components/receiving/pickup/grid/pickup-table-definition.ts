/**
 * `pickup.browse` — Local-pickup table definition (plan Phase 1, wave 2).
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference;
 * the shell recipe, aria name, testid and prefs bucket are the literals the
 * mount used to carry.
 */

import type { PickupLine } from '../pickup-lines';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { PICKUP_GRID_COLUMNS, type PickupGridColumn } from './pickup-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { PICKUP_GRID_CAPABILITIES, makePickupGridDescriptor } from './pickup-grid-descriptor';

export const PICKUP_TABLE_DEFINITION = parseTableDefinition({
  id: 'pickup.browse',
  tableId: 'pickup',
  entityFamily: 'pickup',
  cellMapKey: 'pickup',
  ariaLabel: 'Local pickup order lines',
  testId: 'pickup-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: PICKUP_GRID_CAPABILITIES,
  columns: PICKUP_GRID_COLUMNS,
});

export const PICKUP_TABLE_BINDING: TableSurfaceBinding<PickupLine, PickupGridColumn> = {
  definition: PICKUP_TABLE_DEFINITION,
  columns: PICKUP_GRID_COLUMNS,
  makeDescriptor: makePickupGridDescriptor,
  // Local pickup is a read map an operator scans against; the one write is a
  // confirm dialog, not a record peek.
  recordPlane: {
    kind: 'dialog',
    reason: 'Read map — the only write is the pickup confirm dialog.',
  },
};
