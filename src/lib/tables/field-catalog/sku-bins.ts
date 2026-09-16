/**
 * Per-SKU bin-distribution field catalog — the bindable facts of ONE
 * `bin_contents` row, as DATA.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The retired desk painted FIVE
 * hand-written `AdminTableColumn` objects carrying JSX, with no header sort, no
 * Fields picker and no org binding, because that engine never grew them.
 *
 * ## Why this is NOT the registered `bins` family
 *
 * `bins` is the warehouse-wide overview: a row is a LOCATION, and its facts are
 * aggregates over everything inside it (`sku_count`, `total_qty`, a capacity
 * fill bar, the four floor flags). This desk reads the other axis of the same
 * junction table — a row is one (sku, location) PAIR, and its facts are the
 * per-SKU quantity and the per-SKU replenishment bounds, which the overview
 * cannot express and must not be taught to. Two documents, two entities; see
 * `sku-bin-row.ts`. Forking `bins`' catalog would have handed an org one
 * column layout governing both.
 *
 * ## Where the five retired cells landed
 *
 * | retired cell | fact                  | home on the compound row        |
 * |--------------|-----------------------|---------------------------------|
 * | Bin          | `sku-bins.bin`        | the IDENTITY chip (`fulfillment`)|
 * | Qty          | `sku-bins.qty`        | `status:1`                      |
 * | Min          | `sku-bins.min_qty`    | `status:2`                      |
 * | Max          | `sku-bins.max_qty`    | `status:3`                      |
 * | Last counted | `sku-bins.last_counted`| DATES chrome (day over clock)  |
 *
 * Two facts here were NOT columns on the retired table, and both are the shared
 * skeleton's structural cells asking a question this desk has an answer for:
 *
 * **`sku-bins.item` — the title.** The compound item cell is WHAT the row is
 * about, and every row on this page is about the page's own SKU. Leaving it
 * blank would also leave the Item header with a dead click
 * (`SLOT_TABLE_PAINT_LAW.headerSort`), so the island fills it from the page's
 * header facts — the same move `skuUnitsOverviewRows` already makes for the
 * units sheet's structural Product track.
 *
 * **`sku-bins.level` — the state pill.** A compound row has a pill and this
 * table had no lifecycle column, so the honest options were an invented state
 * or a dead header. It is neither: the word is computed from `qty` against this
 * row's own `min_qty` / `max_qty` in `skuBinLevel`, using the vocabulary the
 * `bins` overview already publishes (`Empty` · `Low` · `Over`) with the same
 * predicates its SQL uses (`location-queries.ts`: `qty < COALESCE(min_qty,-1)`,
 * `total_qty > capacity`, `total_qty = 0`). No new data is fetched and no new
 * vocabulary is minted — it is the comparison the three retired number cells
 * asked a human to perform by eye, named once.
 *
 * ## Not here, and deliberately
 *
 * The overview's aggregate facts (`sku_count`, `total_qty`, `fill_pct`,
 * `capacity`, `is_stale`) belong to a LOCATION row. This feed's `SELECT` does
 * not read them, nothing on this desk paints them, and a fact nothing paints is
 * not a catalog entry — `sku-bins.test.ts` fails the day one of those names
 * appears in a `paths` here.
 *
 * Resolution is `./sku-bins-resolve.ts`, kept separate so this module stays a
 * LEAF.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotTableFamily } from '@/lib/tables/slot-table-family';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const SKU_BINS_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact — which bin. `bin_name ?? bin_barcode ?? #location_id`,
   * the coalesce the retired cell printed in mono, so a bin with no name still
   * names itself by the handle it does have. `displayType: 'id'` is what
   * `parseSlotLayout` requires of an identity.
   */
  {
    id: 'sku-bins.bin',
    family: 'sku-bins',
    label: 'Bin',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { name: 'bin_name', barcode: 'bin_barcode', location: 'location_id' },
  },
  /** The page's subject, on the structural title cell. See the docblock. */
  {
    id: 'sku-bins.item',
    family: 'sku-bins',
    label: 'Item',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { title: 'product_title', sku: 'sku' },
  },
  {
    id: 'sku-bins.qty',
    family: 'sku-bins',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'qty' },
  },
  {
    id: 'sku-bins.min_qty',
    family: 'sku-bins',
    label: 'Min',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'min_qty' },
  },
  {
    id: 'sku-bins.max_qty',
    family: 'sku-bins',
    label: 'Max',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'max_qty' },
  },
  /**
   * SINGLE-valued, unlike `bins.status` — which joins up to four independent
   * flags into `Low · Stale` and therefore refuses to sort. One word sorts
   * like any other resolved fact, so this header stays live.
   */
  {
    id: 'sku-bins.level',
    family: 'sku-bins',
    label: 'Level',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { qty: 'qty', min: 'min_qty', max: 'max_qty' },
  },
  {
    id: 'sku-bins.last_counted',
    family: 'sku-bins',
    label: 'Counted',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_counted' },
  },
];

/**
 * The PRODUCT default: the three QUANTITY facts as the tracks.
 *
 * The skeleton mounts WHOLE (no geometry cut — `COMPOUND_SKELETON_FILTER_DEBT`
 * is documented shrink-only), so `select · fulfillment · thumb · item · dates ·
 * state · status:N · _fill` leaves FOUR status slots under
 * `MAX_DEFAULT_VISIBLE_TRACKS`. This desk spends three of them, because four of
 * its seven facts are painted by chrome the skeleton already mounts:
 *
 * - `bin` — the identity chip (`identityFieldId`).
 * - `item` — the item cell's TITLE.
 * - `level` — the state pill (adapter chrome).
 * - `last_counted` — the DATES chrome. Hash line = the civil day, Calendar
 *   line = the clock, which is the precision the retired `toLocaleString()`
 *   cell had. A bound track beside that chrome would print the same instant
 *   twice.
 *
 * All four stay catalog FACTS, so their headers sort and the search box matches
 * them, and the one free slot is there for a staffer who wants `Counted` as an
 * explicit column — the house form of the retired `tier: 'optional'` (see
 * `ready.ts`, `repair.ts`, `my-day.ts`).
 *
 * `amountFieldId: null` — a bin assignment has no money fact. (The compound
 * skeleton paints no amount track at all; see `COMPOUND_COLUMN_KEYS`.)
 *
 * Guard: `sku-bins.test.ts` parses this against the catalog.
 */
export const SKU_BINS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'sku-bins.bin',
  statusBindings: [
    { fieldId: 'sku-bins.qty' },
    { fieldId: 'sku-bins.min_qty' },
    { fieldId: 'sku-bins.max_qty' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The tableId this catalog serves — `PRODUCT_TABLES`' per-SKU bins entry. */
export const SKU_BINS_TABLE_LAYOUT_ID = 'sku-bins';

/**
 * The FAMILY RECORD — everything the engine needs to mount this pane, as data.
 *
 * The four chrome headers BIND catalog facts, so Bin · Item · Counted · Level
 * take their word and their sort from the same field and cannot drift.
 *
 * Replaces `useSkuBinsTableLayout` + `sku-bins-grid-layout.ts` (2026-09-15).
 */
export const SKU_BINS_FAMILY: SlotTableFamily = {
  tableId: SKU_BINS_TABLE_LAYOUT_ID,
  catalog: SKU_BINS_FIELD_CATALOG,
  productLayout: SKU_BINS_PRODUCT_LAYOUT,
  /**
   * Compound only: a stored `sheet` layout would open `subtitle:N` tracks the
   * compound item cell paints inline. `paintMorph` coerces, and the org write
   * gate (`slotMorphsFor('sku-bins')`) refuses the foreign morph.
   */
  paintMorph: 'compound',
  identityFallbackLabel: 'Bin',
  bandLabels: { status: 'Bin columns', subtitle: 'Under the item' },
  chrome: {
    fulfillment: { field: 'sku-bins.bin' },
    item: { field: 'sku-bins.item' },
    /** "Which of this SKU's bins has not been counted in a while." */
    dates: { field: 'sku-bins.last_counted' },
    /** The pill: qty read against this pair's own min/max. */
    state: { field: 'sku-bins.level' },
  },
};
