/** SKU exception → industrial record facts. */

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
