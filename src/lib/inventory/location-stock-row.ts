/**
 * One row of the `location-stock` family — a single `bin_contents` row anywhere
 * in the warehouse, wire-safe.
 *
 * ## Why this is neither `bins` nor `sku-bins`
 *
 * `bins` (Locations › Bins overview) lists LOCATIONS: one row per bin with
 * `sku_count`, `total_qty`, a capacity fill bar and the four warehouse flags
 * aggregated over everything inside it. `sku-bins` lists the other axis for ONE
 * SKU: every location holding the SKU a detail page is already about, so its
 * item cell is filled from the page's header facts rather than a join.
 *
 * This family is the WAREHOUSE-WIDE pair list — one row per (location, sku),
 * every SKU, every room. That makes `product_title` a real join here (the feed
 * does not know which product a row is about until it reads `sku_stock`) and
 * makes `room` a first-class fact rather than context: the desk's whole reason
 * to exist is "what is sitting in this room", so the room is filterable, bound
 * to a track, and sortable. Neither sibling can answer that — the overview has
 * no product on the row and the per-SKU pane has one SKU.
 *
 * `last_counted` is an ISO STRING, not a `Date`: a slot resolver must resolve
 * the same text for the same row at any time (see `inventory-events-resolve.ts`),
 * and an instant that has to survive an RSC boundary is a string on both sides
 * of it.
 *
 * Field names stay snake_case — the wire names, so the desk hands its rows
 * straight to the family with one mapper and no renaming.
 */

/**
 * Where a row's stock comes from — the two ways this warehouse pairs a SKU to
 * a location, and they are genuinely different physical things.
 *
 * - `bin` — LOOSE stock counted into a bin (`bin_contents`). Written by the
 *   scan gun and the cycle counts: `/api/locations/[barcode]` put/take,
 *   `/api/transfers`, `adjustBinQty`. Carries replenishment bounds and a count
 *   stamp, because somebody counted it.
 * - `unit` — SERIALIZED units standing at a location
 *   (`serial_units.current_location`). Written by the floor routing that
 *   places a unit after unbox/test. Its qty is a COUNT of units, and it has no
 *   min/max and no count stamp, because nobody counts a serial — it is either
 *   there or it is not.
 *
 * Both are on-hand stock and the desk lists both (operator 2026-09-15: *"reach
 * into the data layer more, there are a lot more SKU that are paired to a
 * location id"* — `bin_contents` held 4 pairs while the unit placements held
 * 69). One row per (location, sku, source): merging the two into one number
 * would add a counted quantity to a unit count and hide which half a picker
 * can actually scan.
 */
export type LocationStockSource = 'bin' | 'unit';

/** The shared warehouse-wide stock row — what the catalog, resolver and adapter read. */
export interface LocationStockTableRow {
  /**
   * The `locations` row this stock stands at, or `null` when the placement
   * names a location this warehouse has no row for.
   *
   * Nullable because `serial_units.current_location` is FREE TEXT — the floor
   * routing writes the handle it was given, and most of those resolve to a
   * `locations` row while some (`85`, `QA-BIN-1`) name a place that was never
   * registered. Dropping the unresolved ones would hide real stock; inventing
   * an id for them would be a lie. The row keeps its written handle in
   * {@link location_name} and its face falls through to it.
   */
  location_id: number | null;
  /** `locations.name`, or the raw written handle for an unresolved placement. */
  location_name: string | null;
  /** `locations.barcode` — the scannable handle, and the preferred face. */
  location_barcode: string | null;
  /** `locations.room` — the ROOM facet the funnel selects on. */
  room: string | null;
  /** `locations.row_label` / `col_label` — the grid handle when there is no barcode. */
  row_label: string | null;
  col_label: string | null;
  /** The SKU standing here — the other half of the pair, and an ID in its own right. */
  sku: string;
  /**
   * The product's own name, through the house coalesce
   * `sku_stock.display_name_override → sku_stock.product_title →
   * sku_catalog.product_title`. Null ⇒ neither table names this SKU.
   *
   * `sku_catalog` is the THIRD leg and the one that usually answers: a SKU
   * reaches `sku_stock` the moment stock lands on it, and that row carries a
   * title only when an operator or an import filled one in. Reading the two
   * stock columns alone titled live rows by their bare SKU (`00045-P-2-BK`)
   * while the catalog next door held the real name.
   */
  product_title: string | null;
  /**
   * The product photo — {@link productImageUrl}'s answer (Zoho first, catalog
   * stock photo second). Null ⇒ nothing knows one, and the shared cell paints
   * the typed placeholder rather than a broken `<img>`.
   */
  image_url: string | null;
  /** Which pairing this row came from. See {@link LocationStockSource}. */
  source: LocationStockSource;
  /** How much of this SKU is here — a counted bin qty, or a count of units. */
  qty: number;
  /** Replenishment floor. `null` for a unit placement and for an unset bound. */
  min_qty: number | null;
  /** Capacity ceiling. `null` for a unit placement and for an unset bound. */
  max_qty: number | null;
  /** ISO instant of the last cycle count. `null` for a unit placement. */
  last_counted: string | null;
}

/**
 * Stable row key. All THREE parts are load-bearing: a location holds many
 * SKUs, a SKU sits in many locations, and the same pair can carry both loose
 * counted stock and standing units. Unresolved placements have no id, so the
 * written handle stands in for it.
 */
export function locationStockRowId(row: LocationStockTableRow): string {
  return `${row.location_id ?? row.location_name ?? '?'}:${row.sku}:${row.source}`;
}

/**
 * The ROOMS present in a feed, in first-seen (walking) order, with how many
 * rows each holds.
 *
 * Derived from the rows the desk already has rather than a second query: the
 * funnel must offer exactly the rooms the operator can reach in this list, and
 * a room list read separately would offer empty rooms and print counts that
 * disagree with the body. Rows with no room collapse into one honest bucket
 * keyed {@link UNROOMED_FACET_ID} — dropping them would make the counts in the
 * menu not add up to the table's total.
 */
export const UNROOMED_FACET_ID = '\u0000unroomed' as const;

/** Funnel label for the no-room bucket. */
export const UNROOMED_FACET_LABEL = 'No room' as const;

export interface LocationStockRoomFacet {
  /** The room name, or {@link UNROOMED_FACET_ID} for rows with none. */
  id: string;
  label: string;
  count: number;
}

export function locationStockRoomFacets(
  rows: readonly LocationStockTableRow[],
): LocationStockRoomFacet[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const room = (row.room ?? '').trim();
    const id = room || UNROOMED_FACET_ID;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([id, count]) => ({
    id,
    label: id === UNROOMED_FACET_ID ? UNROOMED_FACET_LABEL : id,
    count,
  }));
}

/**
 * Keep only the rows in the selected rooms. An EMPTY selection is "no room
 * filter", not "no rooms" — the funnel's cleared state must show the whole
 * warehouse, which is the state it opens in.
 */
export function filterLocationStockByRooms(
  rows: readonly LocationStockTableRow[],
  rooms: readonly string[],
): readonly LocationStockTableRow[] {
  if (rooms.length === 0) return rows;
  const wanted = new Set(rooms);
  return rows.filter((row) => wanted.has((row.room ?? '').trim() || UNROOMED_FACET_ID));
}
