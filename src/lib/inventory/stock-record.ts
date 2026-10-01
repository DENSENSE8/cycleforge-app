/** Stock pair → record facts, shared by desktop and mobile Stock surfaces. */

import { isProvisionalSku } from './provisional-sku';
import { skuExceptionLocationFace } from './sku-exception-links';
import type { LocationStockSource, LocationStockTableRow } from './location-stock-row';

export const STOCK_SOURCE_LABEL: Record<LocationStockSource, string> = {
  bin: 'Loose (tote count)',
  unit: 'Serialized units',
  exception: 'Unplaced placeholder',
  empty: 'Empty location',
};

export type StockRecordState = 'onHold' | 'outOfStock' | 'inStock';

export function stockRecordState(
  row: Pick<LocationStockTableRow, 'sku' | 'is_provisional' | 'qty'>,
): StockRecordState {
  if (row.is_provisional || isProvisionalSku(row.sku)) return 'onHold';
  return row.qty > 0 ? 'inStock' : 'outOfStock';
}

export function stockLocationFace(
  row: Pick<LocationStockTableRow, 'location_barcode' | 'location_name'>,
): string | null {
  if (row.location_barcode) return skuExceptionLocationFace(row.location_barcode);
  return row.location_name?.trim() || null;
}

export function stockRecordTitle(
  row: Pick<LocationStockTableRow, 'product_title' | 'sku'>,
): string {
  return row.product_title?.trim() || row.sku;
}
