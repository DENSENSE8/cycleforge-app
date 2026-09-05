/**
 * `inventory.events` — the Inventory Ledger activity table definition.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference.
 * Frozen pane is the shared compound prefix; the identity fact is
 * `inventory-events.sku` — the thing the event happened to, and the only `id`
 * fact in the family (the engine requires an id for identity).
 * `recordPlane` is an honest `none`: an event is a fact, not a record to open;
 * the SKU and serial cells carry their own copy affordances instead.
 */

import type { PulseEventRow } from '@/components/inventory/types';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  INVENTORY_EVENTS_COMPOUND_COLUMNS,
  type InventoryEventsGridColumn,
} from './inventory-events-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  INVENTORY_EVENTS_GRID_CAPABILITIES,
  makeInventoryEventsGridDescriptor,
} from './inventory-events-grid-descriptor';

export const INVENTORY_EVENTS_TABLE_DEFINITION = parseTableDefinition({
  id: 'inventory.events',
  tableId: 'inventory-events',
  entityFamily: 'inventory-events',
  cellMapKey: 'inventory-events',
  ariaLabel: 'Inventory ledger activity',
  testId: 'inventory-events-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: INVENTORY_EVENTS_GRID_CAPABILITIES,
  columns: INVENTORY_EVENTS_COMPOUND_COLUMNS,
});

export const INVENTORY_EVENTS_TABLE_BINDING: TableSurfaceBinding<
  PulseEventRow,
  InventoryEventsGridColumn
> = {
  definition: INVENTORY_EVENTS_TABLE_DEFINITION,
  columns: INVENTORY_EVENTS_COMPOUND_COLUMNS,
  makeDescriptor: makeInventoryEventsGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'An event is a fact that already happened — there is no record behind the row to open. The SKU and serial cells link to the unit and product that DO have one.',
  },
};
