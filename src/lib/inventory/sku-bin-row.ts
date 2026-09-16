/**
 * One row of the `sku-bins` family — a single `bin_contents` row for ONE SKU,
 * wire-safe.
 *
 * ## Why this is not the `bins` row
 *
 * `bins` (Warehouse › Bins overview) lists LOCATIONS: one row per bin, with
 * `sku_count`, `total_qty`, a capacity fill bar and the four warehouse flags
 * aggregated over everything inside it. This row is the OTHER axis of the same
 * junction table — one row per (sku, location) pair, carrying the per-SKU
 * quantity and the per-SKU min/max for that bin. A bin appears once in `bins`
 * and once per SKU here, so the two are different documents about different
 * entities and neither catalog can answer the other's questions.
 *
 * `last_counted` is an ISO STRING, not a `Date`: a slot resolver must resolve
 * the same text for the same row at any time (see `inventory-events-resolve.ts`),
 * and an instant that has to survive an RSC boundary is a string on both sides
 * of it.
 *
 * `product_title` / `sku` are the PAGE's header facts, not a join on
 * `bin_contents` — `/inventory/health/sku/[sku]` already knows which SKU every
 * row is about, so the island fills the structural item cell from what the page
 * holds rather than leaving the shared title track blank. That is the same move
 * `skuUnitsOverviewRows` makes for the units sheet's Product track.
 *
 * Field names stay snake_case — the wire names, so the desk hands its rows
 * straight to the family with one mapper and no renaming.
 */

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
