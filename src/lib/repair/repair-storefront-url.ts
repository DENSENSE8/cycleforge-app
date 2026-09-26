/** Storefront URL for a repair-service SKU — the way BACK to the listing. */

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
