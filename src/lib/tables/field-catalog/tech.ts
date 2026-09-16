/**
 * Tech bench field catalog — the bindable facts of ONE test scan, as DATA.
 *
 * Wave C of the slot-table port (`docs/kill-list/07-slot-table-hand-models.md`,
 * the "station history" row): the Tech and Packer history benches were the last
 * surfaces painting a hand column array (`STATION_HISTORY_COLUMNS` through
 * `StationHistoryTable` → `StationListTable` → a raw `LedgerGrid`). They now
 * mount the one slot `DataTable` engine, which means they need a VOCABULARY —
 * this module.
 *
 * The bench ROW is not a `TechRecord`: it is the shared `QueueRowRecord` that
 * `techRecordToQueueRow` (`@/lib/station/record-to-queue-row`) maps one into,
 * so the bench paints the same compound row the Unshipped board does. That
 * mapper is the ONLY authority on which fields a bench row actually carries,
 * and every `paths` string below names a property it sets. Resolution itself
 * is `./tech-resolve.ts`, kept separate so this module stays a LEAF (the org
 * layout API route imports it server-side; the grid layout module imports it
 * at module scope).
 *
 * ## Facts the flat array painted that are NOT catalog fields, and why
 *
 * **`title` ("Product").** The compound item cell's FIRST line already IS the
 * product title; a binding that repeats it under itself is noise. Same ruling
 * as `orders.title`, which does not exist either.
 *
 * **`age` ("Late").** Lateness is the Dates chrome (`CompoundDelay`) computed
 * off the row's own clock, not a bound fact. The orders family names no `age`
 * field for the same reason.
 *
 * **`stage`.** That track was the state pill, which the compound row's `state`
 * chrome owns. A bound duplicate would disagree with the pill beside it.
 *
 * **`urgent`.** There is no urgency property on a mapped bench row at all —
 * the mapper sets none. Naming a path here would invent a column.
 *
 * **`packStation` ("Station").** Same: the mapper projects no
 * `pack_location_name` / bench label. It becomes bindable the day the feed
 * carries it, not before.
 *
 * **`tracking`.** Not a separate track: the identity cell's SECOND line is the
 * tracking number, which is why {@link TECH_FIELD_CATALOG}'s identity field
 * documents a `tracking` path. Orders does exactly this.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const TECH_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'tech.order_id',
    family: 'tech',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { orderId: 'order_id', tracking: 'shipping_tracking_number' },
  },
  {
    /**
     * The test scan itself — the bench's whole subject, and the one fact the
     * flat model spent THREE tracks on (`tester` · `testedAt` · a station it
     * never had). One `stage_event` says who · when in the space of one.
     *
     * `who` is a staff ID here, not a name: `techRecordToQueueRow` projects
     * `tested_by` / `tester_id` and no name alias, so the cell resolves the
     * actor through the identity cache (avatar + initials) rather than this
     * pure resolver inventing a label. See `CompoundStageStepFacts.whoStaffId`.
     */
    id: 'tech.tested',
    family: 'tech',
    label: 'Tested',
    displayType: 'stage_event',
    slotKinds: ['status'],
    // Reused glyph, not a new key: `picked` is the bench-scan mark the slot
    // cell already owns (`SLOT_STEP_ICONS`).
    iconKey: 'picked',
    stageLabels: { done: 'Tested', pending: 'Test' },
    paths: { whoStaffId: 'tested_by|tester_id', at: 'test_date_time' },
  },
  {
    id: 'tech.qty',
    family: 'tech',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'quantity' },
  },
  {
    id: 'tech.condition',
    family: 'tech',
    label: 'Cond',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'condition' },
  },
  {
    id: 'tech.serial',
    family: 'tech',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'serial_number' },
  },
  {
    id: 'tech.sku',
    family: 'tech',
    label: 'SKU',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'tech.item_number',
    family: 'tech',
    label: 'Item #',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'item_number' },
  },
  {
    id: 'tech.notes',
    family: 'tech',
    label: 'Notes',
    displayType: 'note',
    slotKinds: ['status', 'subtitle'],
    paths: { text: 'notes' },
  },
];

/**
 * The PRODUCT default tech-bench layout: the test step in status:1 — the three
 * tracks the flat array burned on it, collapsed into one — over the subtitle
 * facts the bench already showed (`condition` · `qty`) plus the identifiers it
 * had no room for.
 *
 * `tech.notes` is bindable but UNBOUND: `MAX_SUBTITLE_SLOTS` is five, and the
 * five above are the ones a bench scan is looked up by. An org that wants the
 * scan note under the title binds it without a deploy — which is the whole
 * point of the port.
 *
 * `amountFieldId: null` — a bench log has no money fact. Guard: `tech.test.ts`
 * parses this against the catalog.
 */
export const TECH_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'tech.order_id',
  statusBindings: [{ fieldId: 'tech.tested' }],
  subtitleBindings: [
    { fieldId: 'tech.qty' },
    { fieldId: 'tech.condition' },
    { fieldId: 'tech.serial' },
    { fieldId: 'tech.sku' },
    { fieldId: 'tech.item_number' },
  ],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Tech bench entry. */
export const TECH_TABLE_LAYOUT_ID = 'tech';
