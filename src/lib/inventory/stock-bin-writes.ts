/**
 * One bin a desk verb writes, reduced to what the bin endpoints take — the
 * input to the request builders in `stock-bin-verb-writes.ts`.
 */
export interface StockBinWriteTarget {
  /** The caller's own key for the row it came from, so it can re-find it. */
  rowId: string;
  /** `locations.barcode` — the handle `PATCH /api/locations/[barcode]` uses. */
  barcode: string;
  sku: string;
  /** The counted quantity standing here right now — the ceiling for a take. */
  qty: number;
  /** What the operator sees: the bin code, and the product if we know it. */
  face: string;
}
