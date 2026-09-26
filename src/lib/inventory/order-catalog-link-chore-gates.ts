/**
 * Pure gates / platform detection for Review · Catalog link chores.
 * Kept free of DB / server-only imports so unit tests can run without Neon.
 */

/**
 * Pure gate: should this import row enqueue a catalog-link chore?
 * Requires a non-blank raw Item Number and a catalog miss (null sku_catalog_id).
 */
export function shouldEnqueueCatalogLinkChore(params: {
  rawItemNumber: string;
  skuCatalogId: number | null;
}): boolean {
  return Boolean(params.rawItemNumber.trim()) && params.skuCatalogId == null;
}

/** Normalize sheet platform / account_source into sku_platform_ids.platform keys. */
export function detectListingPlatform(
  accountSource?: string | null,
  orderId?: string | null,
): string {
  const src = (accountSource || '').trim().toLowerCase();
  if (src.startsWith('ebay')) return 'ebay';
  // Sheet cells often say ECWID-RS (the old repair-service face). Same store.
  if (src === 'ecwid' || src.startsWith('ecwid')) return 'ecwid';
  if (src === 'fba' || src === 'amazon_fba') return 'amazon_fba';
  if (src === 'shipstation') return 'shipstation';
  if (src.startsWith('amazon') || src.startsWith('amz')) return 'amazon';
  if (src.startsWith('walmart')) return 'walmart';

  const oid = (orderId || '').trim();
  if (/^\d{2}-\d+-\d+$/.test(oid)) return 'ebay';
  if (/^\d{3}-\d+-\d+$/.test(oid)) return 'amazon';
  if (/^\d{15}$/.test(oid)) return 'walmart';
  if (/^\d{4}$/.test(oid)) return 'ecwid';

  return src || 'unknown';
}

/** The raw identifier a source uses to name the listing on an order line. */
export function resolveListingIdentity(params: {
  itemNumber: string;
  sku: string;
  skuCatalogId: number | null;
}): string {
  const itemNumber = params.itemNumber.trim();
  if (itemNumber) return itemNumber;
  if (params.skuCatalogId != null) return '';
  return params.sku.trim();
}
