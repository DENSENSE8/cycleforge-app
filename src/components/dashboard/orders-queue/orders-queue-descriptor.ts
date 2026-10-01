/** Outbound Orders queue grid surface descriptor — lifts the mounted column model into TanStack defs + declares surface capabilities (the… */

import { makeGridSurfaceDescriptor, type GridSurfaceCapabilities, type GridSurfaceDescriptor } from '@/design-system/components/grid';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { OrdersQueueColumn } from '@/lib/dashboard-order-row-layout';
import { isQueueSortableColumnKey } from '@/utils/queue-display-sort';

/** Orders Workbench spreadsheet capabilities — triage wash, read-only cells. */
export const ORDERS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: true,
  multiSelect: true,
  inCellEdit: false,
  dayBands: false,
};

/** State-math accessor per TRACK key (sort/group value — NOT display markup). */
function accessorFor(key: OrdersQueueColumn['key']): (row: ShippedOrder) => unknown {
  switch (key) {
    case 'item':
      return (row) => String(row.product_title ?? '');
    case 'fulfillment':
      return (row) => String(row.order_id ?? '');
    default:
      return () => null;
  }
}

/** Build the descriptor from a RESOLVED column list (post-visibility), so `contentMinWidthRem` and the TanStack defs follow the tracks that… */
export function makeOrdersGridDescriptor(
  columns: readonly OrdersQueueColumn[],
): GridSurfaceDescriptor<ShippedOrder, OrdersQueueColumn> {
  return makeGridSurfaceDescriptor<ShippedOrder, OrdersQueueColumn>(
    'fulfillment.default',
    columns,
    {
      // Compound-aware: the header's key is a TRACK, the sort vocabulary is in
      // FACTS. Slot tracks (`status:N`) resolve through the bound field id so
      // a rebind of Pick still sorts.
      isSortable: (key) => {
        const col = columns.find((c) => c.key === key);
        return isQueueSortableColumnKey(key, col?.fieldId);
      },
      // Locked = the mounted model's own frozen prefix, never a static list.
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
      accessorFor,
    },
    ORDERS_GRID_CAPABILITIES,
  );
}
