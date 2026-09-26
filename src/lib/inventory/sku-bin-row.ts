/** One row of the `sku-bins` family — a single `bin_contents` row for ONE SKU, wire-safe. */

/** The shared per-SKU bin row — what the catalog, resolver and adapter read. */
export interface SkuBinTableRow {
  /** `bin_contents.location_id` — the row key, and the identity fallback. */
  location_id: number;
  /** `locations.name` — the bin's human handle when it has one. */
  bin_name: string | null;
  /** `locations.barcode` — the scannable handle. */
  bin_barcode: string | null;
  /** `bin_contents.qty` — how much of this SKU is in this bin. */
  qty: number;
  /** Replenishment floor for this SKU in this bin. `null` ⇒ no floor set. */
  min_qty: number | null;
  /** Capacity ceiling for this SKU in this bin. `null` ⇒ no ceiling set. */
  max_qty: number | null;
  /** ISO instant of the last cycle count that touched this pair. */
  last_counted: string | null;
  /** The SKU this row is about — the page's subject, not a join. */
  sku: string;
  /** `sku_catalog.product_title` when the page found a catalog row. */
  product_title: string | null;
}
