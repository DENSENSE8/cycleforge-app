/**
 * Stock pair → industrial record facts. Pure, shared by the ledger row and the
 * evidence column so both read one state and one location face.
 */

import type { LifecycleState } from '@/design-system/tokens/lifecycle';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';

/**
 * `HLD` for a floor-minted placeholder (it cannot be sold or picked by name
 * until paired) — whatever its count; otherwise `OOS` at or below zero and
 * `RDY` while the shelf holds something.
 */
export function stockRecordState(row: Pick<LocationStockTableRow, 'sku' | 'is_provisional' | 'qty'>): LifecycleState {
  if (row.is_provisional || isProvisionalSku(row.sku)) return 'onHold';
  return row.qty > 0 ? 'ready' : 'outOfStock';
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

/**
 * A desk count (±) writes `PATCH /api/locations/[barcode]` — only a LOOSE bin
 * pair with a registered barcode can take one. Serialized units are placed by
 * scan, never counted.
 */
export function stockRecordCountable(row: Pick<LocationStockTableRow, 'source' | 'location_barcode'>): boolean {
  return row.source === 'bin' && Boolean(row.location_barcode);
}
