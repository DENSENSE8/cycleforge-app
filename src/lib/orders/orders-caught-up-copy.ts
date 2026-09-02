/**
 * To-ship inbox-zero copy — distinct from first-run "Connect a sales channel".
 *
 * Title + body are the operator-facing contract. `shippedToday` is the same
 * count the today strip hands to Shipped (`queue-counts.shippedToday`).
 */

export const ORDERS_CAUGHT_UP_TITLE = 'All caught up';

export function ordersCaughtUpDescription(shippedToday: number): string {
  const n = Number.isFinite(shippedToday) ? Math.max(0, Math.floor(shippedToday)) : 0;
  if (n > 0) {
    return `Nothing left to ship. ${n} shipped today. New orders land here as they sync in.`;
  }
  return 'Nothing left to ship. New orders land here as they sync in.';
}

/** True when an empty unfiltered queue is inbox-zero, not a brand-new org. */
export function isOrdersQueueCaughtUp(facts: {
  shippedToday: number;
  ordersEver: number;
  integrationsConnected: number;
}): boolean {
  return (
    facts.shippedToday > 0 || facts.ordersEver > 0 || facts.integrationsConnected > 0
  );
}
