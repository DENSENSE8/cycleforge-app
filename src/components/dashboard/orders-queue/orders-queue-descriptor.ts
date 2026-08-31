/**
 * Outbound Orders queue grid surface descriptor — lifts the mounted column
 * model into TanStack defs + declares surface capabilities (the triage wash is
 * Orders-only today).
 *
 * ONE factory since the Wave-1 hand-model kill
 * (`docs/kill-list/07-slot-table-hand-models.md`): the columns are always a
 * `SlotLayout` materialization (`ordersCompoundColumnsFor`), never a static
 * flat array, and there is no second "tested" mode — `?ustatus=TESTED` is row
 * narrowing, not a column model.
 *
 * Locks and accessors derive from the RESOLVED columns handed in, never from a
 * module constant — a key-only closure over a static list is exactly how the
 * old flat pane math went stale when the mounted model moved (see
 * `CompoundGridCell`'s file docblock for the same lesson on frozen offsets).
 */

import { makeGridSurfaceDescriptor, type GridSurfaceCapabilities, type GridSurfaceDescriptor } from '@/design-system/components/grid';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { OrdersQueueColumn } from '@/lib/dashboard-order-row-layout';
import { isQueueSortableColumnKey } from '@/utils/queue-display-sort';

/** Orders Workbench spreadsheet capabilities — triage wash, read-only cells. */
export const ORDERS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: true,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * State-math accessor per TRACK key (sort/group value — NOT display markup).
 * The compound row's sortable tracks and their facts mirror
 * `COMPOUND_TRACK_SORT_KEYS` (`item` → title, `fulfillment` → order id);
 * every other track resolves null.
 */
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

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that render.
 * Stable exported reference on purpose: the surface memoizes the descriptor on
 * `[makeDescriptor, visible]`, and an inline arrow would rebuild TanStack
 * columnDefs every render (plumbing guard).
 */
export function makeOrdersGridDescriptor(
  columns: readonly OrdersQueueColumn[],
): GridSurfaceDescriptor<ShippedOrder, OrdersQueueColumn> {
  return makeGridSurfaceDescriptor<ShippedOrder, OrdersQueueColumn>(
    'fulfillment.default',
    columns,
    {
      // Compound-aware: the header's key is a TRACK, the sort vocabulary is in
      // FACTS. `isQueueColumnSort` alone answered false for every compound
      // track, so no header offered the affordance and none of them sorted.
      isSortable: isQueueSortableColumnKey,
      // Locked = the mounted model's own frozen prefix, never a static list.
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
      accessorFor,
    },
    ORDERS_GRID_CAPABILITIES,
  );
}
