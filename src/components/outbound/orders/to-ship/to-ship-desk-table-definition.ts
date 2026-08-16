/**
 * To-Ship desk table definitions — desk-local fork of the shared orders grid.
 *
 * Stations (Ready-to-Pack, Packing, Labels, …) keep mounting via
 * `ordersTableBindingFor` / `entityFamily: 'orders'`. Only `/shipping/orders`
 * mounts these bindings through {@link ToShipDeskGridHost}.
 *
 * `cellMapKey: 'orders'` reuses {@link OrdersQueueTableRow} until a dedicated
 * desk cell map is warranted. `tableId: 'to-ship-desk'` isolates staff prefs.
 */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  ORDERS_GRID_CAPABILITIES,
  makeOrdersGridDescriptor,
} from '@/components/dashboard/orders-queue/orders-queue-descriptor';
import type { GridSurfaceDescriptor } from '@/design-system/components/grid';
import type { OrdersQueueColumnMode } from '@/lib/dashboard-order-row-layout';
import {
  TO_SHIP_DESK_COLUMNS,
  TO_SHIP_DESK_TESTED_COLUMNS,
  type ToShipDeskColumn,
} from './ToShipDeskColumns';

function makeToShipDeskGridDescriptor(
  definitionId: 'to-ship.default' | 'to-ship.tested',
  mode: OrdersQueueColumnMode,
  columns: readonly ToShipDeskColumn[],
): GridSurfaceDescriptor<ShippedOrder, ToShipDeskColumn> {
  const descriptor = makeOrdersGridDescriptor(mode, columns);
  return { ...descriptor, id: definitionId };
}

function makeToShipDeskGridDescriptorDefault(
  columns: readonly ToShipDeskColumn[],
): GridSurfaceDescriptor<ShippedOrder, ToShipDeskColumn> {
  return makeToShipDeskGridDescriptor('to-ship.default', 'fulfillment.default', columns);
}

function makeToShipDeskGridDescriptorTested(
  columns: readonly ToShipDeskColumn[],
): GridSurfaceDescriptor<ShippedOrder, ToShipDeskColumn> {
  return makeToShipDeskGridDescriptor('to-ship.tested', 'fulfillment.tested', columns);
}

const TO_SHIP_DESK_DEFAULT_DEFINITION = parseTableDefinition({
  id: 'to-ship.default',
  tableId: 'to-ship-desk',
  entityFamily: 'to-ship',
  cellMapKey: 'orders',
  ariaLabel: 'To Ship desk queue',
  testId: 'to-ship-desk-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: ORDERS_GRID_CAPABILITIES,
  columns: TO_SHIP_DESK_COLUMNS,
});

const TO_SHIP_DESK_TESTED_DEFINITION = parseTableDefinition({
  id: 'to-ship.tested',
  tableId: 'to-ship-desk',
  entityFamily: 'to-ship',
  cellMapKey: 'orders',
  ariaLabel: 'To Ship desk queue — tested',
  testId: 'to-ship-desk-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: ORDERS_GRID_CAPABILITIES,
  columns: TO_SHIP_DESK_TESTED_COLUMNS,
});

export const TO_SHIP_DESK_DEFAULT_BINDING: TableSurfaceBinding<ShippedOrder, ToShipDeskColumn> = {
  definition: TO_SHIP_DESK_DEFAULT_DEFINITION,
  columns: TO_SHIP_DESK_COLUMNS,
  makeDescriptor: makeToShipDeskGridDescriptorDefault,
  recordPlane: { kind: 'inspector', occupantId: 'detail:order' },
};

export const TO_SHIP_DESK_TESTED_BINDING: TableSurfaceBinding<ShippedOrder, ToShipDeskColumn> = {
  definition: TO_SHIP_DESK_TESTED_DEFINITION,
  columns: TO_SHIP_DESK_TESTED_COLUMNS,
  makeDescriptor: makeToShipDeskGridDescriptorTested,
  recordPlane: { kind: 'inspector', occupantId: 'detail:order' },
};

export function toShipDeskTableBindingFor(
  columnMode: 'fulfillment.default' | 'fulfillment.tested',
): TableSurfaceBinding<ShippedOrder, ToShipDeskColumn> {
  return columnMode === 'fulfillment.tested'
    ? TO_SHIP_DESK_TESTED_BINDING
    : TO_SHIP_DESK_DEFAULT_BINDING;
}
