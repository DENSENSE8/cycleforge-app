/**
 * SKU stock-drift field catalog — the bindable facts of ONE `v_sku_stock_drift`
 * row.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The retired desk
 * (`_inventory-admin/TableSections.tsx`, `DRIFT_COLUMNS`) painted SEVEN
 * hand-written `AdminTableColumn` objects carrying JSX, and swapped the whole
 * table out for a prose paragraph when the view was empty — a second table
 * engine with no header sort, no Fields picker, no search, no org binding and
 * no empty STATE (it had an empty BRANCH).
 *
 * A row is a live comparison, not a record: the view exists only while
 * `sku_stock` disagrees with `SUM(sku_stock_ledger.delta)`, so the SKU is the
 * row's identity and there is no id and no timestamp behind it.
 *
 * ## Where the seven facts landed
 *
 * | retired cell  | fact                | home on the compound row         |
 * |---------------|---------------------|----------------------------------|
 * | SKU           | `sku`               | the IDENTITY handle              |
 * | Δ WH          | `warehouse_drift`   | the row TITLE (item cell)        |
 * | Δ Boxed       | `boxed_drift`       | the STATE pill                   |
 * | Stored WH     | `stored_warehouse`  | `status:1`                       |
 * | Ledger WH     | `ledger_warehouse`  | `status:2`                       |
 * | Stored Boxed  | `stored_boxed`      | `status:3`                       |
 * | Ledger Boxed  | `ledger_boxed`      | `status:4`                       |
 *
 * **The two Δ facts lead, and the four counters are the working.** The retired
 * table read stored · ledger · Δ twice over, left to right; what an operator
 * actually triages by is the two deltas, and the counters are the arithmetic
 * behind them. So the deltas take the chrome an operator reads first (title and
 * pill) and the counters take the bound band. Warehouse leads over boxed
 * because it is the dimension `fn_reconcile_sku_stock` replays and the one the
 * retired table put first — one of the two symmetric dimensions has to be the
 * headline, and this is the same order the desk already had.
 *
 * **The signed red rendering is not a fact.** The retired Δ cells painted
 * `text-red-700` when non-zero and prefixed `+` when positive. The NUMBER is
 * the fact: the adapter spells the direction into the value the pill and the
 * title carry ("Warehouse +2" / "Boxed in sync"), and `stateTone` is an
 * accelerator on top of a word that already says it. No field encodes a colour.
 *
 * ## The DATES chrome carries no fact here, and that is a ruling
 *
 * `v_sku_stock_drift` is a join computed at read time: it has no `created_at`,
 * no `detected_at` and no stamp of any kind — a row appears the moment the
 * counters disagree and vanishes the moment they agree. The skeleton still
 * mounts WHOLE (`COMPOUND_SKELETON_FILTER_DEBT` is documented shrink-only, so a
 * desk does not cut chrome geometry to taste), so the `dates` track mounts with
 * a BLANK grid label and `sortable: false` — the same shape `select` and `_fill`
 * already carry, and the same honest-empty face `thumb` paints on every
 * photo-less family. Inventing a timestamp to fill it (the request time, "now")
 * would be a fact this feed does not have. See
 * `admin-sku-drift-grid-layout.ts`, which is where that is applied, and the
 * test that pins it.
 *
 * ## Not here, and deliberately
 *
 * `organization_id` is selected by the view, scoped by the loader and painted by
 * nothing. `admin-sku-drift.test.ts` fails the day it appears in a `paths` here.
 *
 * Resolution is `./admin-sku-drift-resolve.ts`, kept separate so this module
 * stays a LEAF.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const ADMIN_SKU_DRIFT_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'admin-sku-drift.sku',
    family: 'admin-sku-drift',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'admin-sku-drift.warehouse_drift',
    family: 'admin-sku-drift',
    label: 'Δ WH',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'warehouse_drift' },
  },
  {
    id: 'admin-sku-drift.boxed_drift',
    family: 'admin-sku-drift',
    label: 'Δ Boxed',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'boxed_drift' },
  },
  {
    id: 'admin-sku-drift.stored_warehouse',
    family: 'admin-sku-drift',
    label: 'Stored WH',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'stored_stock' },
  },
  {
    id: 'admin-sku-drift.ledger_warehouse',
    family: 'admin-sku-drift',
    label: 'Ledger WH',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'ledger_warehouse' },
  },
  {
    id: 'admin-sku-drift.stored_boxed',
    family: 'admin-sku-drift',
    label: 'Stored Boxed',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'stored_boxed' },
  },
  {
    id: 'admin-sku-drift.ledger_boxed',
    family: 'admin-sku-drift',
    label: 'Ledger Boxed',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'ledger_boxed' },
  },
];

/**
 * The PRODUCT default: the four stored/ledger counters as the bound band, the
 * two deltas and the SKU on chrome.
 *
 * FOUR status tracks is exactly what this mount can afford. The skeleton mounts
 * whole, so `select · fulfillment · thumb · item · dates · state · status:1…4 ·
 * _fill` is exactly `MAX_DEFAULT_VISIBLE_TRACKS` (10) — the `select` gutter is
 * never counted. Binding a fifth fact fails `parseTableDefinition` at module
 * load, which is why the two Δ facts ride the title and the pill rather than
 * taking slots of their own.
 *
 * No subtitle binding: the counters are their own tracks, so a second line
 * under the title would repeat them. An org that would rather read
 * `stored 3 · ledger 5` under the title than as columns moves them there from
 * the Fields menu — every one of the seven facts is bindable in both bands.
 *
 * `amountFieldId: null` — a stock counter is a quantity, not money.
 *
 * Guard: `admin-sku-drift.test.ts` parses this against the catalog.
 */
export const ADMIN_SKU_DRIFT_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'admin-sku-drift.sku',
  statusBindings: [
    { fieldId: 'admin-sku-drift.stored_warehouse' },
    { fieldId: 'admin-sku-drift.ledger_warehouse' },
    { fieldId: 'admin-sku-drift.stored_boxed' },
    { fieldId: 'admin-sku-drift.ledger_boxed' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' SKU-drift entry. */
export const ADMIN_SKU_DRIFT_TABLE_LAYOUT_ID = 'admin-sku-drift';
