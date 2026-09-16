/**
 * Cycle-counts field catalog — the bindable facts of ONE cycle-count campaign.
 *
 * Off `AdminTable` (wave D). The retired desk was the most mechanical second
 * engine left: eight read-only scalars, one entity per row, zero verbs in
 * cells — a hand `AdminTableColumn[]` carrying JSX, with no header sort, no
 * Fields picker and no org binding, because that engine never grew them.
 *
 * ## Facts the flat array painted that are NOT bound tracks, and why
 *
 * **The campaign NAME.** It is the compound item cell's first line (the row's
 * title), exactly as a product title is on the benches. It stays a CATALOG
 * field (`cycle-counts.name`) so the Item header can sort by it and the search
 * box can match it — but it is not bound into a slot, because a track that
 * repeats the title beside the title is noise.
 *
 * **`tol`.** The retired `campaign` cell stacked `tol 0.05` under the name.
 * A second line under a title is a SUBTITLE binding, never a second track —
 * the compound morph paints subtitles inside the item cell.
 *
 * **`status`.** The state pill is chrome (`stateLabel` / `stateTone` on the
 * adapter). The field exists so the Status header sorts and the search box
 * matches, and an org may bind it as an extra column, but the product default
 * leaves it unbound: a bound duplicate would sit beside the pill saying the
 * same word.
 *
 * **`created`.** The Dates chrome Hash line. Same shape as the pill: a real
 * fact the header sorts by, unbound in the product default.
 *
 * **The amber `review` wash.** Tone is not a fact. `pending_review_lines > 0`
 * is a row that needs a human, and the adapter says so with the row's state
 * tone — it never becomes a tenth field.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const CYCLECOUNTS_FIELD_CATALOG: FieldCatalog = [
  { id: 'cycle-counts.id', family: 'cycle-counts', label: 'Campaign', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'id' } },
  { id: 'cycle-counts.name', family: 'cycle-counts', label: 'Name', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'name' } },
  { id: 'cycle-counts.status', family: 'cycle-counts', label: 'Status', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'status' } },
  { id: 'cycle-counts.tol', family: 'cycle-counts', label: 'Tol', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'varianceTol' } },
  { id: 'cycle-counts.lines', family: 'cycle-counts', label: 'Lines', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'totalLines' } },
  { id: 'cycle-counts.counted', family: 'cycle-counts', label: 'Counted', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'countedLines' } },
  { id: 'cycle-counts.review', family: 'cycle-counts', label: 'Review', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'pendingReviewLines' } },
  { id: 'cycle-counts.approved', family: 'cycle-counts', label: 'Approved', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'approvedLines' } },
  { id: 'cycle-counts.created', family: 'cycle-counts', label: 'Created', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'createdAt' } },
  { id: 'cycle-counts.created_by', family: 'cycle-counts', label: 'By', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'createdByName' } },
];

/**
 * The PRODUCT default: the four count scalars the desk exists to read, plus
 * who started the campaign — the five data columns the flat array painted that
 * the compound chrome does not already own.
 *
 * `created_by` is `text`, not `person`, on purpose. The retired cell printed
 * `created_by_name ?? 'system'`, and "system" is not a staff member: a person
 * face would draw an avatar for a sentinel. It becomes a person field the day
 * the feed distinguishes an absent actor from a machine one.
 *
 * FOUR status tracks is what this mount can afford: the skeleton mounts whole
 * (no geometry cut — `COMPOUND_SKELETON_FILTER_DEBT` is shrink-only), so
 * `select · fulfillment · thumb · item · dates · state · status:1…4 · _fill`
 * is exactly `MAX_DEFAULT_VISIBLE_TRACKS` (10). Binding a fifth fails
 * `parseTableDefinition` at module load.
 *
 * `cycle-counts.created_by` therefore ships UNBOUND — the house convention for
 * the old `tier: 'optional'` (see `ready.ts`, `repair.ts`, `my-day.ts`): the
 * fact stays in the catalog and a staffer who wants it binds it. Who created a
 * campaign is provenance you read on one row, not a column you scan.
 *
 * `amountFieldId: null` — a count campaign has no money fact.
 */
export const CYCLECOUNTS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'cycle-counts.id',
  statusBindings: [
    { fieldId: 'cycle-counts.lines' },
    { fieldId: 'cycle-counts.counted' },
    { fieldId: 'cycle-counts.review' },
    { fieldId: 'cycle-counts.approved' },
  ],
  subtitleBindings: [{ fieldId: 'cycle-counts.tol' }],
  amountFieldId: null,
};

export const CYCLECOUNTS_TABLE_LAYOUT_ID = 'cycle-counts';
