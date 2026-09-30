/**
 * Stock pair → record facts. Pure, shared by the list card (`StockLedger`)
 * and the record (`StockEvidence`) so both read one state and one location face.
 */

import type { StockStage } from '@/design-system/tokens/stock-lifecycle';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import type { LocationStockSource, LocationStockTableRow } from '@/lib/inventory/location-stock-row';

/** How the pair is held, as the floor says it — the record's Held row. */
export const STOCK_SOURCE_LABEL: Record<LocationStockSource, string> = {
  bin: 'Loose (tote count)',
  unit: 'Serialized units',
  exception: 'Unplaced placeholder',
};

/**
 * `HLD` for a floor-minted placeholder (it cannot be sold or picked by name
 * until paired) — whatever its count; otherwise `OOS` at or below zero and
 * `STK` while the shelf holds something.
 */
export function stockRecordState(row: Pick<LocationStockTableRow, 'sku' | 'is_provisional' | 'qty'>): StockStage {
  if (row.is_provisional || isProvisionalSku(row.sku)) return 'onHold';
  return row.qty > 0 ? 'inStock' : 'outOfStock';
}

/** The shelf as the floor reads it: the segmented bin code, else the written handle. */
export function stockLocationFace(row: Pick<LocationStockTableRow, 'location_barcode' | 'location_name'>): string | null {
  if (row.location_barcode) return skuExceptionLocationFace(row.location_barcode);
  return row.location_name?.trim() || null;
}

/** The record's title: the product's own name, else its SKU. */
export function stockRecordTitle(row: Pick<LocationStockTableRow, 'product_title' | 'sku'>): string {
  return row.product_title?.trim() || row.sku;
}
