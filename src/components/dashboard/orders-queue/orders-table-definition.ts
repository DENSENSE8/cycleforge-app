/**
 * Outbound Orders table definitions (plan Phase 1, wave 5).
 *
 * Orders is the one **shared parametric grid**: `OrdersGridHost` mounts across
 * ~9 consumers (To-ship, Packed, Shipped, Staged, Labels, Review pairing/packing,
 * compare pane, drill host). What varies is TWO things, on two different axes:
 *
 * - **Column mode** — `fulfillment.default` vs `fulfillment.tested` (tester +
 *   tested-at layout). This is the definition axis: two column models, two
 *   descriptor ids, so TWO definitions/bindings, picked by the adapter.
 * - **Instance identity** — `ariaLabel` / `testId` differ per lane ("Packed
 *   orders", "Labels queue", …). These are genuinely per-mount and stay consumer
 *   overrides on the host; unlike the shell recipe, a lane's screen-reader name
 *   is not a property of the column model.
 *
 * `queueMode` (fulfillment / staged / shipped / labels) is row-CHROME only — it
 * changes status dots and tracking affordances on the row, not the columns or
 * the descriptor — so it is NOT a definition axis.
 *
 * `rowTriageFlags: true` is the load-bearing capability and rides through by
 * reference: Orders is the only family with staff triage row wash.
 */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  ORDERS_QUEUE_COLUMNS,
  ORDERS_QUEUE_TESTED_COLUMNS,
  type OrdersQueueColumn,
} from '@/lib/dashboard-order-row-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  ORDERS_GRID_CAPABILITIES,
  makeOrdersGridDescriptorDefault,
  makeOrdersGridDescriptorTested,
} from './orders-queue-descriptor';

const ORDERS_DEFAULT_TABLE_DEFINITION = parseTableDefinition({
  id: 'fulfillment.default',
  tableId: 'orders',
  entityFamily: 'orders',
  cellMapKey: 'orders',
  // Default lane name — every consumer overrides with its own ("Packed orders",
  // "Labels queue", …) via the host's ariaLabel override.
  ariaLabel: 'Outbound orders',
  testId: 'orders-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: ORDERS_GRID_CAPABILITIES,
  columns: ORDERS_QUEUE_COLUMNS,
});

const ORDERS_TESTED_TABLE_DEFINITION = parseTableDefinition({
  id: 'fulfillment.tested',
  tableId: 'orders',
  entityFamily: 'orders',
  cellMapKey: 'orders',
  ariaLabel: 'Outbound orders — tested',
  testId: 'orders-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: ORDERS_GRID_CAPABILITIES,
  columns: ORDERS_QUEUE_TESTED_COLUMNS,
});

export const ORDERS_DEFAULT_TABLE_BINDING: TableSurfaceBinding<ShippedOrder, OrdersQueueColumn> = {
  definition: ORDERS_DEFAULT_TABLE_DEFINITION,
  columns: ORDERS_QUEUE_COLUMNS,
  makeDescriptor: makeOrdersGridDescriptorDefault,
  // Stable id on purpose: To-ship is walked record-by-record, and a per-order
  // id would play exit → empty → enter on every ↑↓ step.
  recordPlane: { kind: 'inspector', occupantId: 'detail:order' },
};

export const ORDERS_TESTED_TABLE_BINDING: TableSurfaceBinding<ShippedOrder, OrdersQueueColumn> = {
  definition: ORDERS_TESTED_TABLE_DEFINITION,
  columns: ORDERS_QUEUE_TESTED_COLUMNS,
  makeDescriptor: makeOrdersGridDescriptorTested,
  recordPlane: { kind: 'inspector', occupantId: 'detail:order' },
};

/** Pick the binding for the resolved column mode (the adapter's one branch). */
export function ordersTableBindingFor(
  columnMode: 'fulfillment.default' | 'fulfillment.tested',
): TableSurfaceBinding<ShippedOrder, OrdersQueueColumn> {
  return columnMode === 'fulfillment.tested'
    ? ORDERS_TESTED_TABLE_BINDING
    : ORDERS_DEFAULT_TABLE_BINDING;
}
