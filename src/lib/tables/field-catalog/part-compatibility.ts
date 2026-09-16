/**
 * Part-compatibility field catalog — the bindable facts of one model ↔ part
 * edge.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The desk painted six hand-written
 * `AdminTableColumn` objects carrying JSX — Model · Part · Role · Fit ·
 * Source · a trailing Remove cell — with no header sort, no Fields picker and
 * no org binding, because that engine never grew them.
 *
 * ## Which side of the edge is the ROW
 *
 * The PART is the row: `sku` is the identity fact and `product_title` is the
 * title. Three things say so.
 *
 * 1. The desk is entered filtered — `?boseModelId=<id>` — and under that
 *    filter the model repeats down every row while the part is what varies.
 * 2. Unfiltered, the feed is `ORDER BY bm.model_name, pc.part_role,
 *    sc.product_title`: the model is the GROUPING axis and the part is the
 *    leaf.
 * 3. The row's own docblock calls the model side "per-model editing … in the
 *    Bose Models section". This surface audits what is linked TO a model, so
 *    the thing being audited is the part.
 *
 * The model is not demoted for it: `model_name` is the bound SUBTITLE under
 * the part title ("this part, for that model") and `model_number` is its own
 * sortable, searchable track — which the model number never was while it was
 * the second line of a merged cell.
 *
 * ## The `is_oem` / `fit` split
 *
 * The retired Fit cell rendered `{is_oem ? 'OEM ' : ''}{fit}` into ONE pill.
 * Two independent facts in one string: unsortable apart, unsearchable apart,
 * unbindable apart, and an org that wanted to scan for aftermarket parts had
 * nothing to scan. They are two fields here — `oem` on its own track, `fit`
 * on the state pill — and the pill no longer carries an OEM prefix.
 *
 * `confidence`, `notes` and `updated_at` are fetched by the route and were
 * never painted: documented non-goals, see `part-compatibility-row.ts`.
 *
 * Resolution is `./part-compatibility-resolve.ts`, kept separate so this
 * module stays a LEAF.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const PART_COMPATIBILITY_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact — the part's SKU. `displayType: 'id'` is what
   * `parseSlotLayout` requires of an identity, and it is what makes the
   * fulfillment cell paint an ID face rather than prose.
   */
  {
    id: 'part-compatibility.sku',
    family: 'part-compatibility',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'part-compatibility.part',
    family: 'part-compatibility',
    label: 'Part',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'product_title' },
  },
  {
    id: 'part-compatibility.model',
    family: 'part-compatibility',
    label: 'Model',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'model_name' },
  },
  /**
   * The model's lookup handle — `id`, not `text`: an operator matches a part
   * against a chassis by its stamped number, which is the same job an order
   * number does in the identity pane.
   */
  {
    id: 'part-compatibility.model_number',
    family: 'part-compatibility',
    label: 'Model #',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'model_number' },
  },
  {
    id: 'part-compatibility.role',
    family: 'part-compatibility',
    label: 'Role',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'part_role' },
  },
  /** Half of the retired merged pill. The pill keeps this half. */
  {
    id: 'part-compatibility.fit',
    family: 'part-compatibility',
    label: 'Fit',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'fit' },
  },
  /** The other half. Its own fact, its own track, its own sort. */
  {
    id: 'part-compatibility.oem',
    family: 'part-compatibility',
    label: 'OEM',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'is_oem' },
  },
  {
    id: 'part-compatibility.source',
    family: 'part-compatibility',
    label: 'Source',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'source' },
  },
  /**
   * When the edge was LINKED — the compound DATES chrome's fact.
   *
   * The skeleton mounts whole, so the Dates track paints on this desk whether
   * or not the family has a stamp. `created_at` is the only temporal fact on
   * the wire row, and mapping it here is what keeps a mandatory track from
   * being a column of `--` under a header that cannot sort (the header-sort
   * law). It is chrome-carried, so the product layout does not bind it.
   */
  {
    id: 'part-compatibility.linked',
    family: 'part-compatibility',
    label: 'Linked',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
];

/**
 * The PRODUCT default — byte-for-byte the facts the retired table painted,
 * with the merged pill split in two.
 *
 * Four of the nine paint on the shared row CHROME rather than on a track, so
 * binding them as tracks too would print one fact twice (the "lie by
 * repetition" rule in `compound-row-model.ts`):
 *
 * | painted fact   | where it paints on the compound row                  |
 * |----------------|------------------------------------------------------|
 * | sku            | IDENTITY slot = the `fulfillment` track              |
 * | part           | the ITEM cell title, linked to the SKU page          |
 * | fit            | the STATE pill                                       |
 * | linked         | the DATES chrome                                     |
 *
 * That leaves exactly four status tracks — `model_number`, `role`, `oem`,
 * `source` — and one subtitle. FOUR is the ceiling, not a preference: the
 * skeleton mounts whole (no geometry cut — `COMPOUND_SKELETON_FILTER_DEBT` is
 * shrink-only), so `fulfillment · thumb · item · dates · state · status:1…4 ·
 * _fill` is exactly `MAX_DEFAULT_VISIBLE_TRACKS` (10) and a fifth binding
 * fails `parseTableDefinition` at module load.
 *
 * `model` is the SUBTITLE rather than a fifth track because the under-title
 * line on this desk answers "for which model", and the marketing name is what
 * a human reads there while the stamped number is what they scan a column
 * for. Every chrome-carried fact stays in the catalog and an org can bind it
 * anyway — the freedom the six hand-written columns never had.
 *
 * `amountFieldId: null` — a compatibility claim has no money fact.
 *
 * Guard: `part-compatibility.test.ts` parses this against the catalog.
 */
export const PART_COMPATIBILITY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'part-compatibility.sku',
  statusBindings: [
    { fieldId: 'part-compatibility.model_number' },
    { fieldId: 'part-compatibility.role' },
    { fieldId: 'part-compatibility.oem' },
    { fieldId: 'part-compatibility.source' },
  ],
  subtitleBindings: [{ fieldId: 'part-compatibility.model' }],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Compatibility entry. */
export const PART_COMPATIBILITY_TABLE_LAYOUT_ID = 'part-compatibility';
