/**
 * One Inventory › Stock record — a single (location, SKU, source) pairing
 * holding stock anywhere in the warehouse, wire-safe (instants are ISO strings
 * so the row survives the RSC boundary unchanged).
 *
 * Field names stay snake_case — the wire names.
 */

/**
 * Where a row's stock comes from — the two ways this warehouse pairs a SKU to
 * a location, and they are genuinely different physical things.
 *
 * - `bin` — LOOSE stock counted into a bin (`bin_contents`). Written by the
 *   scan gun and the counts (`/api/locations/[barcode]` put/take). Carries
 *   bounds and a count stamp, because somebody counted it — and it is the only
 *   source a desk count (±) can write.
 * - `unit` — SERIALIZED units standing at a location
 *   (`serial_units.current_location`). Its qty is a COUNT of units; nobody
 *   counts a serial — it is either there or it is not.
 *
 * One row per (location, sku, source): merging the two into one number would
 * add a counted quantity to a unit count and hide which half a picker can scan.
 */
export type LocationStockSource = 'bin' | 'unit' | 'exception';

/** The one inventory list can be narrowed by operational state. */
export type LocationStockStateFilter = 'on-hold' | 'catalog';

export interface LocationStockTableRow {
  /**
   * The `locations` row, or `null` when the placement names a location this
   * warehouse has no row for (`serial_units.current_location` is FREE TEXT).
   * The row keeps its written handle in {@link location_name}.
   */
  location_id: number | null;
  /** `locations.name`, or the raw written handle for an unresolved placement. */
  location_name: string | null;
  /** `locations.barcode` — the scannable handle, and the preferred face. */
  location_barcode: string | null;
  /** `locations.room` — the ROOM facet. */
  room: string | null;
  sku: string;
  /**
   * The house title coalesce `sku_stock.display_name_override →
   * sku_stock.product_title → sku_catalog.product_title`. Null ⇒ nothing names it.
   */
  product_title: string | null;
  /**
   * The photo: the Zoho / catalog image for a real SKU (`productImageUrl`), the
   * placeholder's first `SKU_STOCK` photo for a `TMP-` SKU. Null ⇒ none known.
   */
  image_url: string | null;
  /** A floor-minted placeholder SKU (`TMP-…`) awaiting its Zoho pairing. */
  is_provisional: boolean;
  source: LocationStockSource;
  /** How much of this SKU is here — a counted bin qty, or a count of units. */
  qty: number;
  /** ISO instant the pair last moved (bin write, or the newest unit placement). */
  last_moved: string | null;
  /** ISO instant of the last cycle count. `null` for a unit placement. */
  last_counted: string | null;
}

/**
 * Stable row key — the `?open=` value. All THREE parts are load-bearing: a
 * location holds many SKUs, a SKU sits in many locations, and the same pair can
 * carry both loose counted stock and standing units.
 */
export function locationStockRowId(row: LocationStockTableRow): string {
  return `${row.location_id ?? row.location_name ?? '?'}:${row.sku}:${row.source}`;
}

/** Rows with no room collapse into one honest bucket keyed this. */
export const UNROOMED_FACET_ID = '(none)' as const;
export const UNROOMED_FACET_LABEL = 'No room' as const;

export interface LocationStockRoomFacet {
  /** The room name, or {@link UNROOMED_FACET_ID}. */
  id: string;
  label: string;
  count: number;
}

/**
 * The ROOMS present in a feed, in first-seen (walking) order, with how many
 * rows each holds — derived from the rows, so the funnel offers exactly the
 * rooms the operator can reach and its counts add up to the list.
 */
export function locationStockRoomFacets(rows: readonly LocationStockTableRow[]): LocationStockRoomFacet[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = (row.room ?? '').trim() || UNROOMED_FACET_ID;
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
 * filter" — the funnel's cleared state shows the whole warehouse.
 */
export function filterLocationStockByRooms(
  rows: readonly LocationStockTableRow[],
  rooms: readonly string[],
): LocationStockTableRow[] {
  if (rooms.length === 0) return [...rows];
  const wanted = new Set(rooms);
  return rows.filter((row) => wanted.has((row.room ?? '').trim() || UNROOMED_FACET_ID));
}

/** Keep the one stock list, optionally narrowed to its operational state. */
export function filterLocationStockByState(
  rows: readonly LocationStockTableRow[],
  states: readonly LocationStockStateFilter[],
): LocationStockTableRow[] {
  if (states.length === 0) return [...rows];
  const wanted = new Set(states);
  return rows.filter((row) => wanted.has(row.is_provisional ? 'on-hold' : 'catalog'));
}

/** `?status=` wire (comma list) → stock-state filters. */
export function parseStockStates(raw: string | null | undefined): LocationStockStateFilter[] {
  return [...new Set((raw ?? '').split(',').map((value) => value.trim()).filter(
    (value): value is LocationStockStateFilter => value === 'on-hold' || value === 'catalog',
  ))];
}

/** `?room=` wire (comma list) → room ids. */
export function parseStockRooms(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((room) => room.trim())
    .filter(Boolean);
}
