'use client';

import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  ORDERS_QUEUE_COLUMNS,
  ORDERS_QUEUE_FROZEN_CELL,
  isOrdersQueueFrozen,
  ordersQueueFrozenLeft,
  ordersQueueGridCell,
  ordersQueueGridTemplateFor,
  ordersQueueRowShellClass,
  type OrdersQueueColumn,
  type OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';
import { isQueueColumnSort } from '@/utils/queue-display-sort';

const ORDERS_HEADER_LAYOUT: LedgerHeaderLayoutApi<OrdersQueueColumn> = {
  template: ordersQueueGridTemplateFor,
  cellClass: ordersQueueGridCell,
  rowShellClass: ordersQueueRowShellClass,
  frozenCellClass: ORDERS_QUEUE_FROZEN_CELL,
  frozenLeft: ordersQueueFrozenLeft,
  isFrozen: isOrdersQueueFrozen,
  isSortable: isQueueColumnSort,
  // Trailing frozen identity cell (`title`) owns the scroll-edge shadow.
  frozenEdgeKey: 'title',
};

/**
 * Sticky column header for the To-ship / Tested orders sheet.
 *
 * **This was a 358-line fork of the factory until 2026-08-10.** The fork was
 * allowlisted when the shared `LedgerGridColumnHeader` genuinely could not do
 * the job — it had no resize grips and no width clamps, which Orders needed. The
 * factory has since grown both, and by the time this was measured the fork was
 * re-implementing the factory line for line: its `ORDERS_QUEUE_RESIZABLE_KEYS`
 * is `ORDERS_QUEUE_COLUMNS.filter(isGridColumnResizable)` — the factory's own
 * predicate — and `ordersQueueHeaderShowsLabel` is a re-export of
 * `gridHeaderShowsLabel`, the function `GridHeaderLabel` already calls.
 *
 * Half the fork was also dead: its `gridSkin={false}` branch carried a whole
 * second "board / Packed" header look (centered labels, `bg-surface-canvas/95`
 * backdrop-blur, `inset: 'cell'`), and the one live mount
 * (`OrdersGridHost`) always passed `gridSkin`. Nothing rendered it.
 *
 * Retiring it lines Orders up with Unbox History — the table SoT — and Orders
 * *gains* what the fork never had: the Sheets header context menu, and header
 * tooltips that name it.
 *
 * `selectMode: 'always'` preserves the fork's behaviour exactly. It resolved
 * `selectActive = selectMode || gridSkin`, and `gridSkin` was always true, so
 * select-all was armed unconditionally — which is also the To-ship contract
 * (`source-of-truth.md`: "Orders to-ship click-select keeps `'always'`
 * interactive checkboxes on header **and** body").
 *
 * Column order stays pinned to the layout SoT — no drag-reorder.
 */
export const OrdersQueueColumnHeader = makeLedgerGridColumnHeader<
  OrdersQueueColumn,
  OrdersQueueColumnKey,
  'always'
>({
  layout: ORDERS_HEADER_LAYOUT,
  defaultColumns: ORDERS_QUEUE_COLUMNS,
  selectMode: 'always',
});
