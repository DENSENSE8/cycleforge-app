/** Station hand-off hrefs — where a record-plane "open in <station>" control points. */

/**
 * Quality Control (`/test`) deep-link for an order, or `null` when the order has
 * no id to seed with (a seeded-empty search would just land on an unfiltered station).
 */
export function testingHandoffHref(orderId: string | null | undefined): string | null {
  const trimmed = String(orderId ?? '').trim();
  if (!trimmed) return null;
  return `/test?${new URLSearchParams({ search: trimmed }).toString()}`;
}
