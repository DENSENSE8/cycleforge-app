/**
 * Station hand-off hrefs — where a record-plane "open in <station>" control
 * points.
 *
 * **No new id scheme.** Testing (`/test`) is a scanner-driven Station: its
 * selection is ephemeral and it has never owned an order-record param. Its
 * route spec (`TEST_ROUTE_PARAMS` in `@/lib/routing/query-mode-routes`) declares
 * exactly `view` · `search` · `ship` · `testTab`, and the boundary parse
 * (`useSurfaceParamHygiene`) DROPS anything else — so inventing `?openOrderId=`
 * here would produce a link that silently loses its argument on arrival.
 *
 * The honest hand-off is therefore the params `/test` already owns: land on the
 * Testing mode with its workspace search seeded to the marketplace order id.
 * The operator sees their order; the scan loop stays the primary input.
 */

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
