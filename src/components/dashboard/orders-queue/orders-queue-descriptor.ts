/**
 * Outbound Orders queue grid surface descriptor — lifts house
 * `ORDERS_QUEUE_*` columns into TanStack defs + declares surface capabilities
 * (triage flags + in-cell edit are Orders-only today).
 */

import { makeGridSurfaceDescriptor, type GridSurfaceCapabilities, type GridSurfaceDescriptor } from '@/design-system/components/grid';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import {
  isOrdersQueueFrozen,
  ordersQueueColumnsFor,
  type OrdersQueueColumn,
  type OrdersQueueColumnMode,
} from '@/lib/dashboard-order-row-layout';
import { isQueueColumnSort } from '@/utils/queue-display-sort';
import {
  queueRowShipBySource,
  queueRowTestedAtRaw,
  queueRowTesterNameRaw,
  type QueueRowRecord,
} from './helpers';

/** Orders Workbench spreadsheet capabilities — triage wash + in-cell edit. */
export const ORDERS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: true,
  multiSelect: true,
  inCellEdit: true,
  fieldsMenu: true,
  dayBands: false,
};

/** State-math accessor per column key (sort/group value — NOT display markup). */
function accessorFor(key: OrdersQueueColumn['key']): (row: ShippedOrder) => unknown {
  switch (key) {
    case 'title':
      return (row) => String(row.product_title ?? '');
    case 'sla':
      return (row) => queueRowShipBySource(row);
    case 'status':
      return (row) => {
        const r = row as QueueRowRecord;
        return {
          hasTechScan: Boolean(r.has_tech_scan),
          isOutOfStock: Boolean(r.is_out_of_stock ?? r.isOutOfStock),
        };
      };
    case 'qty':
      return (row) => Number(row.quantity) || 0;
    case 'condition':
      return (row) => String(row.condition ?? '');
    case 'tester':
      return (row) => queueRowTesterNameRaw(row as QueueRowRecord);
    case 'testedAt':
      return (row) => queueRowTestedAtRaw(row as QueueRowRecord);
    case 'platform':
      return (row) => String(row.account_source ?? '');
    case 'order':
      return (row) => String(row.order_id ?? '');
    case 'tracking':
      return (row) => {
        const r = row as QueueRowRecord;
        return String((r.tracking_number as string | undefined) || row.shipping_tracking_number || '').trim();
      };
    default:
      return () => null;
  }
}

/**
 * Build the descriptor from a RESOLVED column list (post-visibility / mode), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that render.
 */
export function makeOrdersGridDescriptor(
  mode: OrdersQueueColumnMode,
  columns: readonly OrdersQueueColumn[] = ordersQueueColumnsFor(mode),
): GridSurfaceDescriptor<ShippedOrder, OrdersQueueColumn> {
  return makeGridSurfaceDescriptor<ShippedOrder, OrdersQueueColumn>(
    mode,
    columns,
    {
      isSortable: isQueueColumnSort,
      sortDescFirst: () => false,
      isLocked: isOrdersQueueFrozen,
      accessorFor,
    },
    ORDERS_GRID_CAPABILITIES,
  );
}
