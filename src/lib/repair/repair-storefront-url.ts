/**
 * Storefront URL for a repair-service SKU — the way BACK to the listing.
 *
 * Callers: `GET /api/ecwid/recent-repair-orders` (the receiving link popover),
 * `KioskHistoryDetail` (History's "Where it came from"). Affected API: none of
 * its own. Schemas: `repair_service.source_sku`.
 * User 2026-09-23: *"you should be able to have full reversibility in terms of
 * a link to the Ecwid website via the SKU."*
 *
 * ## `-RS` → `-W`, deliberately
 *
 * A repair ticket's SKU names the SERVICE (`00004-RS`). Nobody wants to look at
 * the service listing — they want the unit it was sold against, which is the
 * "working" SKU (`00004-W`). Landing an operator on the `-RS` page is a
 * round-trip they then have to make by hand, so the swap happens here, once.
 *
 * `NEXT_PUBLIC_` on purpose: the counter tablet is a CLIENT and must be able to
 * build this link without a round trip. Next inlines it at build.
 */

const DEFAULT_STOREFRONT = 'https://usavshop.com';

export function repairStorefrontUrl(sku: string | null | undefined): string | null {
  const trimmed = String(sku ?? '').trim();
  if (!trimmed) return null;
  const storefront = String(
    process.env.NEXT_PUBLIC_ECWID_STOREFRONT_URL || DEFAULT_STOREFRONT,
  )
    .trim()
    .replace(/\/+$/, '');
  const keyword = trimmed.replace(/-RS$/i, '-W');
  return `${storefront}/products/search?keyword=${encodeURIComponent(keyword)}`;
}
