/**
 * Outbound Orders table definition — ONE binding for the whole desk.
 *
 * Orders is the one **shared parametric grid**: `useOrdersSpreadsheet` resolves
 * it onto `NonlinearTableHost` for every outbound consumer (To-ship, Packed,
 * Labels, Staged, Review, Shipped). What varies per mount is **instance
 * identity** only — `ariaLabel` / `testId` differ per lane ("Packed orders",
 * "Labels queue", …) and stay consumer overrides on the host.
 *
 * The second `fulfillment.tested` definition/binding died with the Wave-1
 * hand-model kill (`docs/kill-list/07-slot-table-hand-models.md`): layout
 * encoded as a second product table. `?ustatus=TESTED` is row NARROWING
 * (`UnshippedTable`'s lane predicate) and "show tester + tested-at" is a slot
 * binding (`orders.picked` in `status:1`), so nothing swaps column models.
 *
 * The canonical columns are the PRODUCT-DEFAULT materialization
 * (`ORDERS_COMPOUND_COLUMNS` = `ordersCompoundColumnsFor(ORDERS_PRODUCT_LAYOUT)`)
 * — never a hand array. The live mount overrides them with the effective
 * layout's materialization (staff ?? org ?? product) via the host's `columns`.
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
  ORDERS_COMPOUND_COLUMNS,
  type OrdersQueueColumn,
} from '@/lib/dashboard-order-row-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  ORDERS_GRID_CAPABILITIES,
  makeOrdersGridDescriptor,
} from './orders-queue-descriptor';

const ORDERS_TABLE_DEFINITION = parseTableDefinition({
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
  columns: ORDERS_COMPOUND_COLUMNS,
});

export const ORDERS_DEFAULT_TABLE_BINDING: TableSurfaceBinding<ShippedOrder, OrdersQueueColumn> = {
  definition: ORDERS_TABLE_DEFINITION,
  columns: ORDERS_COMPOUND_COLUMNS,
  makeDescriptor: makeOrdersGridDescriptor,
  // Center Lock L2 — multi-field record form on the desk stage (law Q5).
  recordPlane: { kind: 'stage-overlay', reason: 'To-ship queue walk — table stays mounted under overlay' },
};
