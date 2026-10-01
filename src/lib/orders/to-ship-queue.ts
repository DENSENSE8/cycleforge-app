/**
 * The To-ship queue as the desk COUNTS it — one source for the desk's status
 * chips (`/shipping/orders`) and the phone's pick queue (`/m/pick`, owner
 * 2026-09-28: the phone's "To pick" must equal the desk's exactly).
 *
 * - {@link toShipQueueQuery}: the desk's default read — same key, so both
 *   surfaces share one cache and one realtime invalidation.
 * - {@link toShipQueueOrders}: rows → orders, the desk's grouping (one entry
 *   per order card: its lines) under the default ship-by sort.
 * - {@link queueStatusCounts}: an order counts once per distinct status its
 *   lines answer to.
 *
 * The counts tally the LOADED window ({@link TO_SHIP_QUEUE_WINDOW} rows until
 * the desk's "Load more"), not the server total. Pure: no React.
 */

import type { ShippedOrder } from '@/types/orders';
import { LIFECYCLE_STATES, type LifecycleState } from '@/design-system/tokens/lifecycle';
import type { RowGroup } from '@/lib/group-rows';
import { unshippedOrdersQuery } from '@/lib/queries/dashboard-queries';
import { DATA_TABLE_PAGE_SIZES } from '@/lib/tables/data-table-pagination';
import { pinRecentlyCreatedUnshipped } from '@/lib/orders/order-record-normalize';
import { recordState } from '@/components/outbound/orders/outbound-orders-ledger-state';
import { buildOrdersQueueRows } from '@/components/dashboard/orders-queue/useOrdersQueueRows';

/**
 * The statuses the desk counts and filters by (owner 2026-09-28): Urgent first,
 * then the floor walk To pick → Picked → Packed, Out of stock last. Every order
 * answers to one.
 */
export const QUEUE_STATUS_CHIPS: readonly LifecycleState[] = ['urgent', 'toPick', 'picked', 'packed', 'outOfStock'];

/** Rows the unsearched To-ship desk reads before "Load more" — the widest slot page. */
export const TO_SHIP_QUEUE_WINDOW: number = DATA_TABLE_PAGE_SIZES[DATA_TABLE_PAGE_SIZES.length - 1];

/** The To-ship desk's default read (no find text, no lens, first window). */
export function toShipQueueQuery() {
  return unshippedOrdersQuery({ strictSearchScope: true, limit: TO_SHIP_QUEUE_WINDOW });
}

/** A zero for every lifecycle state. */
export function emptyQueueCounts(): Record<LifecycleState, number> {
  return Object.fromEntries(LIFECYCLE_STATES.map((state) => [state, 0])) as Record<LifecycleState, number>;
}

/** Every order card in the grouped queue, in render order: its lines. */
export function queueOrdersOf(groupsByDate: readonly (readonly [string, readonly RowGroup<ShippedOrder>[]])[]): ShippedOrder[][] {
  return groupsByDate.flatMap(([, groups]) => groups.map((group) => group.rows));
}

/** The desk's order cards for a page of queue rows, under the default (ship-by) sort. */
export function toShipQueueOrders(records: ShippedOrder[]): ShippedOrder[][] {
  const { orderGroupsByDate } = buildOrdersQueueRows({
    records: pinRecentlyCreatedUnshipped(records),
    sort: 'deadline',
    queueMode: 'fulfillment',
  });
  return queueOrdersOf(orderGroupsByDate);
}

/** The statuses one order answers to — one per distinct line status. */
export function queueOrderStatuses(lines: readonly ShippedOrder[]): Set<LifecycleState> {
  return new Set(lines.map(recordState));
}

/** Orders per status: each order once per distinct status its lines answer to. */
export function queueStatusCounts(orders: readonly (readonly ShippedOrder[])[]): Record<LifecycleState, number> {
  const tally = emptyQueueCounts();
  for (const lines of orders) {
    for (const state of queueOrderStatuses(lines)) tally[state] += 1;
  }
  return tally;
}
