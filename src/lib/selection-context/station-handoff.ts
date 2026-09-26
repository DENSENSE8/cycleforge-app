/** Station hand-off hrefs — where a record-plane "open in <station>" control points. */

/** Testing mode on `/test` — absent means Shipping, so it must be explicit. */
const TESTING_VIEW = 'testing';

/**
 * `/test` deep-link for an order, or `null` when the order has no id to seed
 * with (a seeded-empty search would just land on an unfiltered station).
 */
export function testingHandoffHref(orderId: string | null | undefined): string | null {
  const trimmed = String(orderId ?? '').trim();
  if (!trimmed) return null;
  const params = new URLSearchParams({ view: TESTING_VIEW, search: trimmed });
  return `/test?${params.toString()}`;
}
