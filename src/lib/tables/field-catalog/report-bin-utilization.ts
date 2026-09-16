/**
 * Bin-utilization report field catalog — the bindable facts of ONE
 * `mv_bin_utilization` row.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). `/reports` painted SIX hand-written
 * `AdminTableColumn` objects carrying JSX, over rows typed
 * `Record<string, unknown>` — a second table engine's column type, with no
 * header sort, no Fields picker and no org binding, because that engine never
 * grew them. The row type is now real (`@/lib/reports/report-rows`).
 *
 * ## Where the six facts landed
 *
 * | retired cell | fact         | home on the compound row            |
 * |--------------|--------------|-------------------------------------|
 * | Bin          | `bin`        | the IDENTITY handle (`barcode ?? bin_name`) |
 * | Room         | `room`       | the row TITLE (item cell)           |
 * | Fill         | `fill`       | the STATE pill (derived percentage) |
 * | Qty          | `in_bin`     | `status:1`                          |
 * | Cap          | `capacity`   | `status:2`                          |
 * | SKUs         | `sku_count`  | `status:3`                          |
 *
 * Three of those are decisions rather than transcription.
 *
 * **`fill` is DERIVED, not pathed.** The wire row carries `fill_ratio`, a
 * ratio; the retired cell rendered `(Number(r.fill_ratio) * 100).toFixed(0)%`.
 * So the FACT an operator reads, sorts and searches is the percentage, and the
 * ratio is its input — which is why `paths` here names `ratio` and never
 * `value`. A `paths: { value: 'fill_ratio' }` entry would promise the engine a
 * column it can read straight off the row, and the number it would read
 * (`0.88`) is not the number the desk shows. The derivation lives in
 * `binFillPercent` (`./report-bin-utilization-resolve.ts`), once, so the pill
 * face and the sort key cannot disagree.
 *
 * **`fill` takes the STATE pill.** The route's own `ORDER BY fill_ratio DESC
 * NULLS LAST` says what this report is FOR, and the pill is the one cell an
 * operator scanning a page reads first. It is a number rather than a closed
 * vocabulary, so the mount gives the relabelled `state` chrome track
 * `slotDisplayType: 'number'` and the header sorts numerically — see
 * `report-bin-utilization-grid-layout.ts`. Banding it into `Full` / `Has room`
 * / `Empty` words was rejected: the sibling `bins` family has real DB flags
 * for that (`is_over_capacity`, `is_empty`) and this MV row has none, so the
 * vocabulary would have been invented here and the thresholds guessed.
 *
 * **`room` takes the TITLE.** A compound row's title is what the thing IS, and
 * a bin row's answer to that is where it is. The identity handle is the
 * barcode, which the identity chip already paints.
 *
 * ## Not here, and deliberately
 *
 * `row_label` and `col_label` are selected by the route and painted by
 * nothing. A fact nothing paints is not a catalog entry; they are stripped at
 * the `fetch` boundary (`report-rows.ts`) and `report-bin-utilization.test.ts`
 * fails the day either name appears in a `paths` here. `bin_id` is the row KEY
 * — a stable handle for React and for selection, never a painted fact.
 *
 * ## The one factless chrome track
 *
 * This row has NO temporal column at all: the route's `SELECT` names none, and
 * changing it is a stated non-goal. So the mandatory `dates` chrome track
 * carries no fact and is declared inert at the mount rather than cut from the
 * skeleton (`COMPOUND_SKELETON_FILTER_DEBT` is shrink-only). See the grid
 * layout for the full ruling.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const REPORT_BIN_UTILIZATION_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact — the bin's scannable handle. `displayType: 'id'` is
   * what `parseSlotLayout` requires of an identity and what makes the
   * fulfillment cell paint an ID face rather than prose. Two paths because the
   * retired cell coalesced: a bin with no barcode is still named by its label.
   */
  {
    id: 'report-bin-utilization.bin',
    family: 'report-bin-utilization',
    label: 'Bin',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'barcode', fallback: 'bin_name' },
  },
  {
    id: 'report-bin-utilization.room',
    family: 'report-bin-utilization',
    label: 'Room',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'room' },
  },
  /** DERIVED — `paths` names the INPUT ratio, never a readable column. */
  {
    id: 'report-bin-utilization.fill',
    family: 'report-bin-utilization',
    label: 'Fill',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { ratio: 'fill_ratio' },
  },
  {
    id: 'report-bin-utilization.in_bin',
    family: 'report-bin-utilization',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'in_bin' },
  },
  {
    id: 'report-bin-utilization.capacity',
    family: 'report-bin-utilization',
    label: 'Cap',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'capacity' },
  },
  {
    id: 'report-bin-utilization.sku_count',
    family: 'report-bin-utilization',
    label: 'SKUs',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sku_count' },
  },
];

/**
 * The PRODUCT default: HOW MUCH is in the bin, against what it holds.
 *
 * The skeleton mounts WHOLE (no geometry cut — `COMPOUND_SKELETON_FILTER_DEBT`
 * is documented shrink-only), so `select · fulfillment · thumb · item · dates
 * · state · status:N · _fill` leaves FOUR status slots under
 * `MAX_DEFAULT_VISIBLE_TRACKS` (10). This desk binds three of them, because
 * three of its six facts are painted by chrome the skeleton already mounts:
 *
 * - `bin` — the identity chip (`identityFieldId`).
 * - `room` — the item cell's TITLE. A track repeating the title is noise.
 * - `fill` — the state pill (adapter chrome).
 *
 * All three stay catalog FACTS, so their headers sort and the search box
 * matches them, and a staffer who wants `fill` as an explicit numeric column
 * has a free slot to bind it into — the house form of the retired
 * `tier: 'optional'` (see `ready.ts`, `repair.ts`, `my-day.ts`).
 *
 * `amountFieldId: null` — a bin has no money fact.
 *
 * Guard: `report-bin-utilization.test.ts` parses this against the catalog.
 */
export const REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'report-bin-utilization.bin',
  statusBindings: [
    { fieldId: 'report-bin-utilization.in_bin' },
    { fieldId: 'report-bin-utilization.capacity' },
    { fieldId: 'report-bin-utilization.sku_count' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Bin utilization. */
export const REPORT_BIN_UTILIZATION_TABLE_LAYOUT_ID = 'report-bin-utilization';
