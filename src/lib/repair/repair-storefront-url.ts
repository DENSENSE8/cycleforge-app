/**
 * Storefront URL for a repair-service SKU — the way BACK to the listing.
 *
 * Callers: `GET /api/ecwid/recent-repair-orders` (the receiving link popover),
 * `KioskHistoryDetail` (the storefront button on each repair ITEM line).
 * Affected API: none of its own. Schemas: `repair_service.source_sku`.
 * User 2026-09-23: *"you should be able to have full reversibility in terms of
 * a link to the Ecwid website via the SKU."*
 *
 * ## The SKU is used AS TYPED — no `-RS` → `-W` swap
 *
 * This helper used to rewrite `00802-RS` to `00802-W` on the theory that `-W`
 * meant the "working" unit. It does not: in this catalog the trailing letters
 * are COLOURWAYS. `00802` ships as `-W` (white), `-G` and `-G-1` (graphite),
 * `00004` as `-G` / `-S` / `-MB` / `-W`. Measured against `platform_listings`:
 * all 23 distinct `repair_service.source_sku` values have an exact listing,
 * while only 12 have a `-W` twin — so the swap sent 11 of 23 to a keyword with
 * no product behind it, and the other 12 to the WHITE unit regardless of what
 * the customer owns. `00802-RS` is "REPAIR SERVICE for Bose Wave Radio CD
 * Awrc-1G Awrc-1P"; its `-W` landed on a white radio nobody mentioned.
 *
 * The listing an operator wants back is the one that was SOLD — the service
 * listing on the ticket. That is the SKU, unmodified.
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
  return `${storefront}/products/search?keyword=${encodeURIComponent(trimmed)}`;
}
