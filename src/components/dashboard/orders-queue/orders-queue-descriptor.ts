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
import { getDaysLateNullable } from '@/utils/date';
import { isQueueColumnSort } from '@/utils/queue-display-sort';
import {
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
    case 'age':
      // Same derived days-late number the Late cell shows.
      return (row) => getDaysLateNullable(row.deadline_at || row.ship_by_date);
    case 'condition':
      return (row) => String(row.condition ?? '');
    case 'qty':
      return (row) => Number(row.quantity) || 0;
    case 'tester':
      return (row) => queueRowTesterNameRaw(row as QueueRowRecord);
    case 'testedAt':
      return (row) => queueRowTestedAtRaw(row as QueueRowRecord);
    case 'packStation':
      return (row) =>
        String((row as { pack_location_name?: string | null }).pack_location_name ?? '').trim() ||
        null;
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
      // Late column activates most-overdue-first (desc); other facts stay asc.
      sortDescFirst: (key) => key === 'age',
      isLocked: isOrdersQueueFrozen,
      accessorFor,
    },
    ORDERS_GRID_CAPABILITIES,
  );
}

/**
 * Stable `LedgerGridSurface` factories — one per column mode. The surface
 * memoizes the descriptor on `[makeDescriptor, visible]`; an inline arrow
 * would rebuild TanStack columnDefs every render (plumbing guard).
 */
export function makeOrdersGridDescriptorDefault(
  columns: readonly OrdersQueueColumn[],
): GridSurfaceDescriptor<ShippedOrder, OrdersQueueColumn> {
  return makeOrdersGridDescriptor('fulfillment.default', columns);
}

export function makeOrdersGridDescriptorTested(
  columns: readonly OrdersQueueColumn[],
): GridSurfaceDescriptor<ShippedOrder, OrdersQueueColumn> {
  return makeOrdersGridDescriptor('fulfillment.tested', columns);
}
