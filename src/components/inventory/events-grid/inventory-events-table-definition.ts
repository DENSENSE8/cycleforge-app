/** `inventory.events` — the Inventory Ledger activity table definition. */

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

const INVENTORY_EVENTS_TABLE_DEFINITION = parseTableDefinition({
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
