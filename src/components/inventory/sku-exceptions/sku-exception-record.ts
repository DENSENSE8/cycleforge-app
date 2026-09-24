/**
 * SKU exception → industrial record facts. Pure — no JSX, no fetch — so the
 * ledger row and the evidence column read ONE answer for "what step is next"
 * and "does this match the find box".
 *
 * Every placeholder is `HLD` (`LIFECYCLE.onHold`): stock that exists but cannot
 * be sold or picked by name until it is paired to its Zoho item. The
 * difference between two held records is the NEXT step, in the order a desk
 * resolves one: a photo (pairing is guesswork without one) → a count (where it
 * is and how many) → the pair itself.
 */

import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';

export type SkuExceptionNextStep = 'Photo' | 'Count' | 'Pair';

export function skuExceptionNextStep(
  row: Pick<ProvisionalSku, 'photoCount' | 'stock' | 'locations'>,
): SkuExceptionNextStep {
  if (row.photoCount === 0) return 'Photo';
  if (row.stock <= 0 || row.locations.length === 0) return 'Count';
  return 'Pair';
}

/** The record's title: the name typed on the phone, else the placeholder SKU. */
export function skuExceptionTitle(row: Pick<ProvisionalSku, 'productTitle' | 'sku'>): string {
  return row.productTitle.trim() || row.sku;
}

/** Every location holding the placeholder, in its segmented face. */
export function skuExceptionLocationFaces(row: Pick<ProvisionalSku, 'locations'>): string[] {
  return row.locations.filter((loc) => loc.qty !== 0).map((loc) => skuExceptionLocationFace(loc.barcode));
}

/**
 * The find box, answered client-side over every fact the record paints: title,
 * SKU, barcode, description, location (raw and segmented), creator. The feed
 * is one row per open placeholder, so the whole set is always on the client.
 * Case-insensitive; every whitespace-separated term must match somewhere.
 */
export function skuExceptionMatches(row: ProvisionalSku, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    row.productTitle,
    row.sku,
    row.barcode,
    row.description ?? '',
    row.createdByName ?? '',
    ...row.locations.flatMap((loc) => [loc.barcode, skuExceptionLocationFace(loc.barcode), loc.room ?? '']),
  ]
    .join('\n')
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
