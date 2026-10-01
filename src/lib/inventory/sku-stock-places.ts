import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import type { StockBinWriteTarget } from '@/lib/inventory/stock-bin-writes';

export interface SkuPlaceRow {
  location: { id: number; name: string; room: string | null; barcode: string | null };
  qty: number;
}

export function skuPlacesQueryKey(sku: string) {
  return ['sku-stock', sku, 'places'] as const;
}

export function skuPlaceWriteTarget(sku: string, barcode: string, qty: number): StockBinWriteTarget {
  return {
    rowId: `${barcode}:${sku}`,
    barcode,
    sku,
    qty,
    face: `${skuExceptionLocationFace(barcode)} · ${sku}`,
  };
}
