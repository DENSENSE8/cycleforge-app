/** Outbound Orders table definition — ONE binding for the whole desk. */

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
import { OrdersRowPlane } from '@/components/outbound/orders/to-ship/MorphingRowActionMenu';

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
  /** CYC-82 — picking a row in the gutter opens the assign manifold beside it. */
  rowPlane: {
    reason: 'CYC-82 assign manifold — staff pick a row and assign without leaving the queue',
    Component: OrdersRowPlane,
  },
};
