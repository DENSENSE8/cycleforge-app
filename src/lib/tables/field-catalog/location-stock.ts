/**
 * Warehouse-wide stock-by-location field catalog — the bindable facts of ONE
 * `(location, sku)` pair, as DATA.
 *
 * ## The desk this serves
 *
 * Inventory › **Stock** (`/inventory/stock`): every pair in the warehouse
 * holding stock. The operator question is "what is sitting where", so the row's
 * IDENTITY is the LOCATION and its TITLE is the PRODUCT — the two facts a
 * putaway or a pick is addressed by — and the count rides under the title as
 * the line qty, which is the engine's own law for a countable line
 * (`slot-table-line-qty.ts`: `{family}.qty` is pinned to `subtitle:1` and may
 * not leave it).
 *
 * | fact                          | home on the compound row |
 * |-------------------------------|--------------------------|
 * | `location-stock.location`     | the IDENTITY chip (`fulfillment` track) |
 * | `location-stock.item`         | the item cell's TITLE |
 * | `location-stock.qty`          | UNDER the title — line qty, `subtitle:1` |
 * | `location-stock.room`         | `status:1` |
 * | `location-stock.sku`          | `status:2` |
 * | `location-stock.level`        | the state pill (adapter chrome) |
 * | `location-stock.last_counted` | the DATES chrome (day over clock) |
 * | `location-stock.min_qty`      | unbound — opt-in from the Fields menu |
 * | `location-stock.max_qty`      | unbound — opt-in from the Fields menu |
 *
 * ## Why `room` is a FACT here and context everywhere else
 *
 * On `bins` the room is where the row already is (the overview is walked room
 * by room) and on `sku-bins` there is one SKU, so the room is a detail of the
 * bin's name. This list spans the whole floor, so the room is the axis the desk
 * narrows on: the funnel beside the search box selects rooms, the track sorts
 * by them, and the search box matches them. A facet the operator filters by and
 * cannot see on the row would be a hidden filter.
 *
 * ## Not here, and deliberately
 *
 * The overview's aggregates (`sku_count`, `total_qty`, `fill_pct`, `capacity`)
 * belong to a LOCATION row, not to a pair — this feed's `SELECT` does not read
 * them and nothing on the desk paints them. `location-stock.test.ts` fails the
 * day one of those names appears in a `paths` here.
 *
 * Resolution is `./location-stock-resolve.ts`, kept separate so this module
 * stays a LEAF.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotTableFamily } from '@/lib/tables/slot-table-family';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const LOCATION_STOCK_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact — WHERE. `barcode` first (it is what a gun reads), else
   * `room · name`, else the row/col handle, else `#location_id`; the house
   * coalesce in `formatStagedLocationFace`, not a second one.
   * `displayType: 'id'` is what `parseSlotLayout` requires of an identity.
   */
  {
    id: 'location-stock.location',
    family: 'location-stock',
    label: 'Location',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: {
      barcode: 'location_barcode',
      name: 'location_name',
      room: 'room',
      row: 'row_label',
      col: 'col_label',
      id: 'location_id',
    },
  },
  /** WHAT — the catalog title, else the bare SKU. The structural title cell. */
  {
    id: 'location-stock.item',
    family: 'location-stock',
    label: 'Item',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { title: 'product_title', sku: 'sku' },
  },
  /**
   * HOW MANY — the line qty. Named `.qty` with `displayType: 'number'` and a
   * `subtitle` band on purpose: that triple is what `isLineQtyField` reads, so
   * the engine pins it under the item title on every peer and the Fields menu
   * locks it there (`LINE_QTY_LOCKED_REASON`).
   */
  {
    id: 'location-stock.qty',
    family: 'location-stock',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'qty' },
  },
  /** The narrowing axis — see the docblock. */
  {
    id: 'location-stock.room',
    family: 'location-stock',
    label: 'Room',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'room' },
  },
  /**
   * The SKU — an IDENTIFIER, not a description, so `displayType: 'id'` gives it
   * the mono copyable face every handle in this product wears.
   *
   * It rides UNDER the location id in the Id track (operator 2026-09-15: *"the
   * SKU is an id and it should display under the location id most left
   * column"*), which the engine paints through `identitySubFace`. It stays a
   * catalog fact so the search box matches it and a staffer can still bind it
   * as an explicit column; it is NOT bound by default, because the Id track
   * already says it and a bound track would print it twice.
   */
  {
    id: 'location-stock.sku',
    family: 'location-stock',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku' },
  },
  /**
   * WHICH PAIRING this row came from — loose counted bin stock, or serialized
   * units standing at the location. Two different physical things with two
   * different verbs (a bin qty is adjusted, a unit is moved), so a desk that
   * lists both owes the operator the word. See {@link LocationStockSource}.
   */
  {
    id: 'location-stock.source',
    family: 'location-stock',
    label: 'Held as',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'source' },
  },
  {
    id: 'location-stock.min_qty',
    family: 'location-stock',
    label: 'Min',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'min_qty' },
  },
  {
    id: 'location-stock.max_qty',
    family: 'location-stock',
    label: 'Max',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'max_qty' },
  },
  /**
   * SINGLE-valued, unlike `bins.status` — which joins up to four independent
   * flags into `Low · Stale` and therefore refuses to sort. One word sorts like
   * any other resolved fact, so this header stays live.
   */
  {
    id: 'location-stock.level',
    family: 'location-stock',
    label: 'Level',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { qty: 'qty', min: 'min_qty', max: 'max_qty' },
  },
  {
    id: 'location-stock.last_counted',
    family: 'location-stock',
    label: 'Counted',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_counted' },
  },
];

/**
 * The PRODUCT default: the ROOM and the HELD-AS word as tracks, everything else
 * on chrome the skeleton already mounts.
 *
 * `select · fulfillment · thumb · item · dates · state · status:N · _fill`
 * mounts WHOLE (no geometry cut — `COMPOUND_SKELETON_FILTER_DEBT` is
 * documented shrink-only), leaving FOUR status slots under
 * `MAX_DEFAULT_VISIBLE_TRACKS`. This desk spends TWO, because six of its ten
 * facts are painted by chrome:
 *
 * - `location` — the identity chip's TOP line (`identityFieldId`), carrying
 *   the EXACT bin code and nothing else (operator 2026-09-15: *"the id for the
 *   exact location is good in the id column"*).
 * - `sku` — the identity chip's BOTTOM line, through `identitySubFace`
 *   (operator 2026-09-15: *"the SKU is an id and it should display under the
 *   location id most left column"*). The Id track has always stacked two
 *   identifiers; on this desk they are the place and the product.
 * - `item` — the item cell's TITLE, the product's own name.
 * - `qty` — UNDER that title, as the line qty (engine law, not a choice), with
 *   the `on-hand` meaning so a shelf holding four does not paint as a warning.
 * - `level` — the state pill (adapter chrome).
 * - `last_counted` — the DATES chrome. Hash line = the civil day, Calendar
 *   line = the clock. A bound track beside that chrome would print the same
 *   instant twice.
 *
 * `room` is a TRACK, not part of the identity face. It was folded into that
 * face for one iteration and the operator ruled it back out: a room is a
 * separate question from a bin code, so it gets a separate, sortable column,
 * and the Id header's sort stays the bin order rather than a room order
 * wearing the bin's name.
 *
 * `source` is bound because this feed unions TWO pairings — counted bin stock
 * and standing serialized units. A desk that lists both without saying which
 * is which tells a picker to go scan a quantity that has no barcode.
 *
 * The two free slots are there for a staffer who wants `Min` / `Max` as
 * explicit columns — the house form of the retired `tier: 'optional'`.
 *
 * `amountFieldId: null` — stock on a shelf has no money fact. (The compound
 * skeleton paints no amount track at all; see `COMPOUND_COLUMN_KEYS`.)
 *
 * Guard: `location-stock.test.ts` parses this against the catalog.
 */
export const LOCATION_STOCK_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'location-stock.location',
  statusBindings: [{ fieldId: 'location-stock.room' }, { fieldId: 'location-stock.source' }],
  subtitleBindings: [{ fieldId: 'location-stock.qty' }],
  amountFieldId: null,
};

/** The tableId this catalog serves — `PRODUCT_TABLES`' stock-by-location entry. */
export const LOCATION_STOCK_TABLE_LAYOUT_ID = 'location-stock';

/**
 * The FAMILY RECORD — everything the engine needs to mount this desk, as data.
 *
 * The four chrome headers BIND catalog facts (`slotTableColumnsFor` reads the
 * word and `slotTableSortFactFor` the sort off the same field), so Location ·
 * Item · Counted · Level cannot drift from what the columns actually sort by.
 * There is no label override here because this catalog already words its
 * facts the way the desk says them — an override is for the desks where the
 * two genuinely differ, not a habit.
 *
 * Replaces `useLocationStockTableLayout` + `location-stock-grid-layout.ts`
 * (2026-09-15): both were data wearing a module.
 */
export const LOCATION_STOCK_FAMILY: SlotTableFamily = {
  tableId: LOCATION_STOCK_TABLE_LAYOUT_ID,
  catalog: LOCATION_STOCK_FIELD_CATALOG,
  productLayout: LOCATION_STOCK_PRODUCT_LAYOUT,
  /**
   * Compound only: a stored `sheet` layout would open a `subtitle:1` track for
   * the line qty the item cell paints inline — the "count became a column"
   * failure the operator ruled against. `paintMorph` coerces; the org write
   * gate (`slotMorphsFor('location-stock')`) refuses the foreign morph.
   */
  paintMorph: 'compound',
  identityFallbackLabel: 'Location',
  bandLabels: { status: 'Shelf columns', subtitle: 'Under the item' },
  chrome: {
    fulfillment: { field: 'location-stock.location' },
    /** Sorts by the TITLE, not the qty riding under it: "group this floor by product". */
    item: { field: 'location-stock.item' },
    /** "Which shelf has not been counted in a while" — the question the column exists for. */
    dates: { field: 'location-stock.last_counted' },
    state: { field: 'location-stock.level' },
  },
};
