/**
 * Dead-stock report field catalog — the bindable facts of ONE dormant-SKU row
 * (90 days or more without a ledger write).
 *
 * Off `AdminTable` 2026-09-12 (Wave D). `/reports` painted FOUR hand-written
 * `AdminTableColumn` objects carrying JSX, over rows typed
 * `Record<string, unknown>` — a second table engine's column type, with no
 * header sort, no Fields picker and no org binding, because that engine never
 * grew them. The row type is now real (`@/lib/reports/report-rows`).
 *
 * ## Where the four facts landed
 *
 * | retired cell  | fact           | home on the compound row            |
 * |---------------|----------------|-------------------------------------|
 * | SKU           | `sku`          | the IDENTITY handle                 |
 * | Product       | `product`      | the row TITLE (item cell)           |
 * | Stock         | `stock`        | `status:1`                          |
 * | Days dormant  | `days_dormant` | the STATE pill                      |
 *
 * **`days_dormant` takes the STATE pill.** The route's own `ORDER BY
 * days_dormant DESC NULLS LAST` says what this report is FOR, and the pill is
 * the one cell an operator scanning a page reads first. It is a count rather
 * than a closed vocabulary, so the mount gives the relabelled `state` chrome
 * track `slotDisplayType: 'number'` and the header sorts numerically — see
 * `report-dead-stock-grid-layout.ts`. Banding it into `Stale` / `Dead` words
 * was rejected: the thresholds would have been invented here, and the only
 * boundary the route actually models is null-vs-number.
 *
 * It also fixes a live bug. `days_dormant` is `NULL::int` for a SKU that never
 * moved — the route's `includeNeverMoved` branch selects exactly those rows —
 * and the retired cell rendered `Number(r.days_dormant)`, which printed `NaN`.
 * The pill now says `Never moved`, and the fact resolves to blank text so the
 * engine's blank rule sinks those rows to the bottom under both sort
 * directions (which is what `NULLS LAST` already did on the server).
 *
 * ## The fifth fact, and why it is here
 *
 * `last_move_at` is selected by the route and was painted by NO retired cell.
 * It is a catalog fact anyway, for the reason `part-compatibility.linked`
 * states: the compound skeleton mounts WHOLE, so the `dates` chrome track
 * paints on this desk whether or not the family has a stamp, and a mandatory
 * track with no fact is a column of `--` under a header that cannot sort
 * (`SLOT_TABLE_PAINT_LAW.headerSort`). `last_move_at` is the only temporal
 * fact on the wire row, and it is the instant `days_dormant` is counted from —
 * so the Dates chrome says WHEN and the pill says HOW LONG, which is the same
 * fact at the two resolutions an operator asks for. It is chrome-carried, so
 * the product layout does not bind it.
 *
 * That is the narrow exception to "never restore a fetched-but-unpainted
 * field": the field is not being restored into a track nobody asked for — it
 * is what a track the engine already mounts now paints.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const REPORT_DEAD_STOCK_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact. `displayType: 'id'` is what `parseSlotLayout` requires
   * of an identity, and it is what makes the fulfillment cell paint an ID face
   * rather than prose.
   */
  {
    id: 'report-dead-stock.sku',
    family: 'report-dead-stock',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'report-dead-stock.product',
    family: 'report-dead-stock',
    label: 'Product',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'product_title' },
  },
  {
    id: 'report-dead-stock.stock',
    family: 'report-dead-stock',
    label: 'Stock',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'stock' },
  },
  {
    id: 'report-dead-stock.days_dormant',
    family: 'report-dead-stock',
    label: 'Dormant',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'days_dormant' },
  },
  /** The compound DATES chrome's fact — see the docblock. */
  {
    id: 'report-dead-stock.last_move',
    family: 'report-dead-stock',
    label: 'Last move',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_move_at' },
  },
];

/**
 * The PRODUCT default: how much is sitting there, and for how long.
 *
 * The skeleton mounts WHOLE (no geometry cut — `COMPOUND_SKELETON_FILTER_DEBT`
 * is documented shrink-only), so `select · fulfillment · thumb · item · dates
 * · state · status:N · _fill` leaves FOUR status slots under
 * `MAX_DEFAULT_VISIBLE_TRACKS` (10). This desk binds ONE, because four of its
 * five facts are painted by chrome the skeleton already mounts:
 *
 * - `sku` — the identity chip (`identityFieldId`).
 * - `product` — the item cell's TITLE. A track repeating the title is noise.
 * - `days_dormant` — the state pill (adapter chrome).
 * - `last_move` — the DATES chrome's Hash line.
 *
 * All four stay catalog FACTS, so their headers sort and the search box
 * matches them, and a staffer who wants the dormancy count as an explicit
 * numeric column has three free slots to bind it into — the house form of the
 * retired `tier: 'optional'` (see `ready.ts`, `repair.ts`, `my-day.ts`).
 *
 * `amountFieldId: null` — the route selects no price, so the money a dormant
 * SKU ties up is not a fact this report has. Inventing one from a cost lookup
 * would be a new query, not a port.
 *
 * Guard: `report-dead-stock.test.ts` parses this against the catalog.
 */
export const REPORT_DEAD_STOCK_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'report-dead-stock.sku',
  statusBindings: [{ fieldId: 'report-dead-stock.stock' }],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Dead stock entry. */
export const REPORT_DEAD_STOCK_TABLE_LAYOUT_ID = 'report-dead-stock';
