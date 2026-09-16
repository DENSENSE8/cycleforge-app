/**
 * SKU-velocity report field catalog — the bindable facts of ONE 30-day
 * movement row.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). `/reports` painted SIX hand-written
 * `AdminTableColumn` objects carrying JSX, over rows typed
 * `Record<string, unknown>` — a second table engine's column type, with no
 * header sort, no Fields picker and no org binding, because that engine never
 * grew them. The row type is now real (`@/lib/reports/report-rows`).
 *
 * ## Where the six facts landed
 *
 * | retired cell | fact      | home on the compound row              |
 * |--------------|-----------|---------------------------------------|
 * | Tier         | `tier`    | the STATE pill                        |
 * | SKU          | `sku`     | the IDENTITY handle                   |
 * | Product      | `product` | the row TITLE (item cell)             |
 * | Out          | `out_qty` | `status:1`                            |
 * | In           | `in_qty`  | `status:2`                            |
 * | Stock        | `stock`   | `status:3`                            |
 *
 * `velocity_tier` is a closed vocabulary — `A` / `B` / `C` / `D`, straight off
 * the route's `CASE` — which is exactly what the state pill is for.
 *
 * **The retired rose/emerald colouring is not a fact.** `Out` rendered
 * `text-rose-600` and `In` rendered `text-emerald-600`; the numbers are the
 * facts, the hues were decoration, and they are gone rather than reproduced as
 * a tone. (Tone on this desk would have to mean "needs a human", and nothing
 * on a velocity report does.)
 *
 * ## The seventh fact, and why it is here
 *
 * `last_move_at` is selected by the route and was painted by NO retired cell.
 * It is a catalog fact anyway, for the reason `part-compatibility.linked`
 * states: the compound skeleton mounts WHOLE, so the `dates` chrome track
 * paints on this desk whether or not the family has a stamp, and a mandatory
 * track with no fact is a column of `--` under a header that cannot sort
 * (`SLOT_TABLE_PAINT_LAW.headerSort`). `last_move_at` is the only temporal
 * fact on the wire row, and on a 30-day velocity report "when did this SKU
 * last move" is the question the window is about. It is chrome-carried, so the
 * product layout does not bind it.
 *
 * That is the narrow exception to "never restore a fetched-but-unpainted
 * field": the field is not being restored into a track nobody asked for — it
 * is what a track the engine already mounts now paints.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const REPORT_VELOCITY_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact. `displayType: 'id'` is what `parseSlotLayout` requires
   * of an identity, and it is what makes the fulfillment cell paint an ID face
   * rather than prose.
   */
  {
    id: 'report-velocity.sku',
    family: 'report-velocity',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'report-velocity.product',
    family: 'report-velocity',
    label: 'Product',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'product_title' },
  },
  {
    id: 'report-velocity.tier',
    family: 'report-velocity',
    label: 'Tier',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'velocity_tier' },
  },
  {
    id: 'report-velocity.out_qty',
    family: 'report-velocity',
    label: 'Out',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'out_qty' },
  },
  {
    id: 'report-velocity.in_qty',
    family: 'report-velocity',
    label: 'In',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'in_qty' },
  },
  {
    id: 'report-velocity.stock',
    family: 'report-velocity',
    label: 'Stock',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'current_stock' },
  },
  /** The compound DATES chrome's fact — see the docblock. */
  {
    id: 'report-velocity.last_move',
    family: 'report-velocity',
    label: 'Last move',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_move_at' },
  },
];

/**
 * The PRODUCT default: what left, what arrived, what is left.
 *
 * The skeleton mounts WHOLE (no geometry cut — `COMPOUND_SKELETON_FILTER_DEBT`
 * is documented shrink-only), so `select · fulfillment · thumb · item · dates
 * · state · status:N · _fill` leaves FOUR status slots under
 * `MAX_DEFAULT_VISIBLE_TRACKS` (10). This desk binds three, because four of
 * its seven facts are painted by chrome the skeleton already mounts:
 *
 * - `sku` — the identity chip (`identityFieldId`).
 * - `product` — the item cell's TITLE. A track repeating the title is noise.
 * - `tier` — the state pill (adapter chrome).
 * - `last_move` — the DATES chrome's Hash line.
 *
 * All four stay catalog FACTS, so their headers sort and the search box
 * matches them, and a staffer who wants `tier` or `last_move` as an explicit
 * column has a free slot to bind it into — the house form of the retired
 * `tier: 'optional'` (see `ready.ts`, `repair.ts`, `my-day.ts`).
 *
 * `amountFieldId: null` — this report carries no money. (Velocity is counted
 * in units; the route selects no price.)
 *
 * Guard: `report-velocity.test.ts` parses this against the catalog.
 */
export const REPORT_VELOCITY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'report-velocity.sku',
  statusBindings: [
    { fieldId: 'report-velocity.out_qty' },
    { fieldId: 'report-velocity.in_qty' },
    { fieldId: 'report-velocity.stock' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Velocity entry. */
export const REPORT_VELOCITY_TABLE_LAYOUT_ID = 'report-velocity';
