/** Inventory › Ledger activity grid surface descriptor — lifts the MOUNTED column model (a `SlotLayout` materialization) into the TanStack… */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { PulseEventRow } from '@/components/inventory/types';
import {
  defaultDirForInventoryEventsColumn,
  isInventoryEventsColumnSortable,
  type InventoryEventsGridColumn,
} from './inventory-events-grid-layout';

/**
 * The ledger is a READ MAP: an event already happened, so there is nothing to
 * triage, edit in cell or select in bulk. `fieldsMenu` stays on — binding and
 * hiding facts is the whole point of the slot port.
 */
export const INVENTORY_EVENTS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that render.
 */
export function makeInventoryEventsGridDescriptor(
  columns: readonly InventoryEventsGridColumn[],
): GridSurfaceDescriptor<PulseEventRow, InventoryEventsGridColumn> {
  return makeGridSurfaceDescriptor<PulseEventRow, InventoryEventsGridColumn>(
    'inventory.events',
    columns,
    {
      isSortable: (key) => isInventoryEventsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForInventoryEventsColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix.
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    INVENTORY_EVENTS_GRID_CAPABILITIES,
  );
}
