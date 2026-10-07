/** One Inventory › Stock record — a single (location, SKU, source) pairing holding stock anywhere in the warehouse, wire-safe (instants are… */

import { locationCode, parseLocationCodeFlat, rackCode } from '@/lib/barcode-routing';
import type { RowGroup } from '@/lib/group-rows';

/** Where a row's stock comes from — including a deliberate empty-location triage row. */
export type LocationStockSource = 'bin' | 'unit' | 'exception' | 'empty';


export const LOCATION_STOCK_SORTS = ['location-asc', 'location-desc', 'qty-desc', 'qty-asc', 'counted-asc'] as const;
export type LocationStockSort = (typeof LOCATION_STOCK_SORTS)[number];

/** Sidebar sort control for the stock ledger. Values are {@link LOCATION_STOCK_SORTS}. */
export const LOCATION_STOCK_SORT_OPTIONS: readonly { value: LocationStockSort; label: string }[] = [
  { value: 'location-asc', label: 'Earliest location first' },
  { value: 'location-desc', label: 'Latest location first' },
  { value: 'qty-desc', label: 'Most on hand' },
  { value: 'qty-asc', label: 'Least on hand' },
  { value: 'counted-asc', label: 'Longest since count' },
];

const LOCATION_STOCK_SORT_SET: ReadonlySet<string> = new Set(LOCATION_STOCK_SORTS);

export function parseLocationStockSort(raw: string | null | undefined): LocationStockSort {
  return raw != null && LOCATION_STOCK_SORT_SET.has(raw) ? (raw as LocationStockSort) : 'location-asc';
}

/** A counted bin with no cycle count. Units have no count column; empty places are capacity. */
export function locationStockNeverCounted(row: Pick<LocationStockTableRow, 'source' | 'last_counted'>): boolean {
  return row.source === 'bin' && row.last_counted == null;
}

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
  /** Numeric aisle extracted from the warehouse location code, when present. */
  aisle: number | null;
  /** Numeric bay extracted from the warehouse location code, when present. */
  bay: number | null;
  /** Numeric level extracted from the warehouse location code, when present. */
  level: number | null;
  /** Numeric position extracted from the warehouse location code, when present. */
  position: number | null;
  sku: string;
  /** `sku_stock.id` — the SKU_STOCK photo / task anchor. Null ⇒ the SKU has no stock row. */
  stock_id: number | null;
  /**
   * `sku_stock.location` — the SKU's home bin as written (the To-ship queue's
   * `sku_home_location`; set by Pair bin, `POST /api/update-sku-location`).
   * Null ⇒ the SKU has no home bin yet.
   */
  home_location: string | null;
  /**
   * `sku_stock.display_name_override`, else the SKU identity law
   * (`resolveSkuIdentityTitle`: catalog → Zoho item name), else the
   * `sku_stock` title (a TMP placeholder's typed name). Null ⇒ nothing names it.
   */
  product_title: string | null;
  /**
   * The photo: the SKU's own first `SKU_STOCK` photo, else the catalog / Zoho
   * image (`productImageUrl`). Null ⇒ none known.
   */
  image_url: string | null;
  /** Full-resolution URL of the SKU's own cover photo (null when the cover is a catalog/Zoho image). */
  cover_photo_url: string | null;
  /** A floor-minted placeholder SKU (`TMP-…`) awaiting its Zoho pairing. */
  is_provisional: boolean;
  source: LocationStockSource;
  /** How much of this SKU is here — a counted bin qty, or a count of units. */
  qty: number;
  /** Reorder threshold for a counted bin pair; null for units and locations without one. */
  min_qty: number | null;
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

/**
 * Resolve an `?open=` key to its row, tolerating a STALE empty-location key:
 * once an empty location gains stock (or a `TMP-` pair), its `<loc>::empty`
 * row is gone. Links that still name it land on that location's current row
 * instead of "not in this list any more" — and keep their place in the walk.
 */
export function resolveLocationStockRow(
  rows: readonly LocationStockTableRow[],
  key: string,
): LocationStockTableRow | null {
  const direct = rows.find((row) => locationStockRowId(row) === key) ?? null;
  if (direct || !key.endsWith(':empty')) return direct;
  const place = key.slice(0, -':empty'.length);
  const locationId = Number.parseInt(place, 10);
  return (
    rows.find(
      (row) =>
        row.source !== 'empty' &&
        (Number.isFinite(locationId) ? row.location_id === locationId : row.location_name === place),
    ) ?? null
  );
}

const LOCATION_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function locationIdentity(row: LocationStockTableRow): string {
  return `${row.location_id ?? row.location_barcode ?? row.location_name ?? '?'}`;
}

function parsedLocation(row: LocationStockTableRow) {
  return row.location_barcode ? parseLocationCodeFlat(row.location_barcode) : null;
}

/** One desktop stock card = one rack level; its positions become product lines. */
export function locationStockRackKey(row: LocationStockTableRow): string {
  const parsed = parsedLocation(row);
  if (parsed) {
    return `rack:${(row.room ?? '').trim().toUpperCase()}:${rackCode(parsed)}`;
  }
  const written = row.location_barcode?.trim() || row.location_name?.trim();
  if (written) return `place:${written.toUpperCase()}`;
  if (row.location_id != null) return `id:${row.location_id}`;
  // No physical place exists to group by. Keep unrelated exception products
  // separate instead of inventing one giant "Unlocated" rack.
  return `unlocated:${row.sku}:${row.source}`;
}

/** Rack-level face shown once at the top of a grouped stock card. */
export function locationStockRackFace(row: LocationStockTableRow): string | null {
  const parsed = parsedLocation(row);
  if (parsed) return rackCode(parsed);
  return row.location_barcode?.trim() || row.location_name?.trim() || null;
}

/** Exact product position, shown on each line when a rack is unfolded. */
export function locationStockPositionFace(row: LocationStockTableRow): string | null {
  const parsed = parsedLocation(row);
  if (parsed) return Number(parsed.position) === 0 ? rackCode(parsed) : locationCode(parsed);
  return row.location_barcode?.trim() || row.location_name?.trim() || null;
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

function compareLocationRows(
  left: LocationStockTableRow,
  right: LocationStockTableRow,
  direction: 1 | -1,
): number {
  const room = LOCATION_COLLATOR.compare(left.room ?? '', right.room ?? '');
  if (room !== 0) return direction * room;
  for (const key of ['aisle', 'bay', 'level', 'position'] as const) {
    const part = compareNullableNumber(left[key], right[key]);
    if (part === 0) continue;
    // A location without a numeric coordinate never becomes the "latest"
    // numeric location merely because descending reverses the walk.
    if (left[key] == null || right[key] == null) return part;
    return direction * part;
  }
  return direction * LOCATION_COLLATOR.compare(
    left.location_barcode ?? left.location_name ?? '',
    right.location_barcode ?? right.location_name ?? '',
  );
}

/**
 * Location-walk face: one row per physical location, in exact numeric code
 * order. The first pair remains the record anchor; quantities from unrelated
 * SKUs at the same location are never folded into it.
 */
export function locationStockWalkRows(
  rows: readonly LocationStockTableRow[],
  sort: LocationStockSort,
): LocationStockTableRow[] {
  const byLocation = new Map<string, LocationStockTableRow>();
  for (const row of rows) {
    const key = locationIdentity(row);
    const current = byLocation.get(key);
    if (!current || (current.source === 'empty' && row.source !== 'empty')) {
      byLocation.set(key, row);
    }
  }
  return [...byLocation.values()].sort((left, right) => compareStockSort(left, right, [left], [right], sort));
}

/**
 * Desktop stock cards in warehouse order. A rack sentinel (`…-00`) and its
 * numbered positions share one card; the rows stay intact as expandable
 * product lines, so grouping never discards a SKU or count.
 */
export function locationStockRackGroups(
  rows: readonly LocationStockTableRow[],
  sort: LocationStockSort,
): RowGroup<LocationStockTableRow>[] {
  const byRack = new Map<string, LocationStockTableRow[]>();
  for (const row of rows) {
    const key = locationStockRackKey(row);
    const group = byRack.get(key);
    if (group) group.push(row);
    else byRack.set(key, [row]);
  }

  const groups = [...byRack].map(([key, groupRows]) => ({
    key,
    rows: groupRows.sort((left, right) => {
      // A real positive count is the collapsed lead. Empty/zero placeholders
      // remain reachable under +N items instead of hiding the useful product.
      const leftRank = left.source === 'empty' ? 2 : left.qty > 0 ? 0 : 1;
      const rightRank = right.source === 'empty' ? 2 : right.qty > 0 ? 0 : 1;
      if (leftRank !== rightRank) return leftRank - rightRank;
      const place = compareLocationRows(left, right, 1);
      return place || LOCATION_COLLATOR.compare(left.sku, right.sku);
    }),
  }));
  return groups.sort((left, right) => compareStockSort(left.rows[0]!, right.rows[0]!, left.rows, right.rows, sort));
}

function onHandTotal(rows: readonly LocationStockTableRow[], sort: 'qty-desc' | 'qty-asc'): number {
  const stocked = rows.filter((row) => row.source !== 'empty');
  // An empty address is capacity. It stays at the end of both quantity orders.
  if (stocked.length === 0) return sort === 'qty-desc' ? -1 : Number.POSITIVE_INFINITY;
  return stocked.reduce((sum, row) => sum + Math.max(0, row.qty), 0);
}

/**
 * Cycle-count rank for a card. An uncounted bin is first; a card with no bins
 * (units, empty places) is last, because it has no cycle count to age.
 */
function countRank(rows: readonly LocationStockTableRow[]): number {
  const bins = rows.filter((row) => row.source === 'bin');
  if (bins.length === 0) return Number.POSITIVE_INFINITY;
  let oldest = Number.POSITIVE_INFINITY;
  for (const row of bins) {
    if (row.last_counted == null) return Number.NEGATIVE_INFINITY;
    const ms = Date.parse(row.last_counted);
    if (Number.isNaN(ms)) return Number.NEGATIVE_INFINITY;
    if (ms < oldest) oldest = ms;
  }
  return oldest;
}

function compareStockSort(
  left: LocationStockTableRow,
  right: LocationStockTableRow,
  leftRows: readonly LocationStockTableRow[],
  rightRows: readonly LocationStockTableRow[],
  sort: LocationStockSort,
): number {
  if (sort === 'qty-desc' || sort === 'qty-asc') {
    const qty = onHandTotal(leftRows, sort) - onHandTotal(rightRows, sort);
    if (qty !== 0) return sort === 'qty-desc' ? -qty : qty;
    return compareLocationRows(left, right, 1);
  }
  if (sort === 'counted-asc') {
    const rank = countRank(leftRows) - countRank(rightRows);
    if (rank !== 0) return rank;
    return compareLocationRows(left, right, 1);
  }
  return compareLocationRows(left, right, sort === 'location-desc' ? -1 : 1);
}

/** Rows with no room collapse into one honest bucket keyed this. */
export const UNROOMED_FACET_ID = '(none)' as const;
const UNROOMED_FACET_LABEL = 'No room' as const;

export interface LocationStockRoomFacet {
  /** The room name, or {@link UNROOMED_FACET_ID}. */
  id: string;
  label: string;
  count: number;
}

/** Resolve only an explicit valid room; bare Stock must remain warehouse-wide. */
export function resolveExplicitStockRoom(
  rooms: readonly LocationStockRoomFacet[],
  requestedRoom: string | null | undefined,
): string | null {
  const requested = requestedRoom?.trim();
  if (!requested) return null;
  return rooms.find((room) => room.id === requested || room.label === requested)?.id ?? null;
}

/** The row's ROOM facet id — comma-bearing names use a comma-safe wire id. */
export function locationStockRoomId(row: Pick<LocationStockTableRow, 'room'>): string {
  const room = (row.room ?? '').trim();
  if (!room) return UNROOMED_FACET_ID;
  return room.includes(',') ? encodeURIComponent(room) : room;
}

/** Decode the comma-list room wire; comma-bearing room names use encoded ids. */
export function parseLocationStockRoomIds(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    });
}

/** Parse the contextual aisle comma-list without turning an empty value into aisle 0. */
export function parseLocationStockAisles(raw: string | null | undefined): number[] {
  return [...new Set(
    (raw ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map(Number)
      .filter((value) => Number.isInteger(value) && value >= 0),
  )];
}

/**
 * The ROOMS present in a feed, in first-seen (walking) order, with how many
 * rows each holds — derived from the rows, so the chips offer exactly the
 * rooms the operator can reach and their counts add up to the list.
 */
export function locationStockRoomFacets(rows: readonly LocationStockTableRow[]): LocationStockRoomFacet[] {
  const facets = new Map<string, LocationStockRoomFacet>();
  for (const row of rows) {
    const id = locationStockRoomId(row);
    const current = facets.get(id);
    if (current) current.count += 1;
    else {
      facets.set(id, {
        id,
        label: id === UNROOMED_FACET_ID ? UNROOMED_FACET_LABEL : (row.room ?? '').trim(),
        count: 1,
      });
    }
  }
  return [...facets.values()];
}
