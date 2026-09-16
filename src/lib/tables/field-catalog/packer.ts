/**
 * Packer bench field catalog — the bindable facts of ONE pack scan, as DATA.
 *
 * Wave C of the slot-table port; the SIBLING of `./tech.ts`, never a merge.
 * The two benches share a row SHAPE (both map into the shared
 * `QueueRowRecord`) but not a question: a tech row reports a test scan, a
 * packer row reports a carton being built — and a packer row carries BOTH
 * stamps, because `packerRecordToQueueRow` projects the upstream tester as
 * well (`tested_by` / `test_date_time` / `tested_by_name` / `tester_name`).
 * That is why the flat bench painted a Tester column beside the Packer one,
 * and why this catalog names two stage events where `./tech.ts` names one.
 *
 * `packerRecordToQueueRow` (`@/lib/station/record-to-queue-row`) is the ONLY
 * authority on which fields a bench row carries; every `paths` string below
 * names a property it sets. Resolution is `./packer-resolve.ts`, kept separate
 * so this module stays a LEAF.
 *
 * ## Facts the flat array painted that are NOT catalog fields, and why
 *
 * `title` is the item cell's first line; `age` ("Late") is the Dates chrome;
 * `stage` is the state pill's own derivation; `tracking` is the identity
 * cell's second line (see the identity field's `tracking` path). See
 * `./tech.ts` for the long form of each.
 *
 * **`urgent`** and **`packStation`** are dropped outright: the mapper projects
 * no urgency flag and no `pack_location_name` / bench label, so there is no
 * path to name. The pack step below therefore resolves `station: null` rather
 * than inventing one — an honest blank, not a guess.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const PACKER_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'packer.order_id',
    family: 'packer',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { orderId: 'order_id', tracking: 'shipping_tracking_number' },
  },
  {
    /**
     * The UPSTREAM test stamp, carried on a packer row. Unlike the tech bench,
     * this mapper does project name aliases (`tested_by_name` / `tester_name`),
     * so the step can paint a name as well as an avatar.
     */
    id: 'packer.tested',
    family: 'packer',
    label: 'Tested',
    displayType: 'stage_event',
    slotKinds: ['status'],
    iconKey: 'picked',
    stageLabels: { done: 'Tested', pending: 'Test' },
    paths: {
      who: 'tested_by_name|tester_name',
      whoStaffId: 'tested_by|tester_id',
      at: 'test_date_time',
    },
  },
  {
    /**
     * The pack scan — this bench's own subject. No `station`: the mapper
     * projects no bench label (see the module header).
     */
    id: 'packer.packed',
    family: 'packer',
    label: 'Packed',
    displayType: 'stage_event',
    slotKinds: ['status'],
    iconKey: 'packed',
    stageLabels: { done: 'Packed', pending: 'Pack' },
    paths: {
      who: 'packed_by_name',
      whoStaffId: 'packed_by|packer_id',
      at: 'packed_at',
    },
  },
  {
    id: 'packer.qty',
    family: 'packer',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'quantity' },
  },
  {
    id: 'packer.condition',
    family: 'packer',
    label: 'Cond',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'condition' },
  },
  {
    id: 'packer.serial',
    family: 'packer',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'serial_number' },
  },
  {
    id: 'packer.sku',
    family: 'packer',
    label: 'SKU',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'packer.item_number',
    family: 'packer',
    label: 'Item #',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'item_number' },
  },
  {
    id: 'packer.notes',
    family: 'packer',
    label: 'Notes',
    displayType: 'note',
    slotKinds: ['status', 'subtitle'],
    paths: { text: 'notes' },
  },
];

/**
 * The PRODUCT default packer-bench layout: both lifecycle steps in the status
 * band, in the order the flat array painted them (Tester before Packer), over
 * the subtitle facts the bench showed (`condition` · `qty`) plus the
 * identifiers it had no room for.
 *
 * `packer.notes` is bindable but UNBOUND — `MAX_SUBTITLE_SLOTS` is five. See
 * `./tech.ts` for the same ruling.
 *
 * `amountFieldId: null` — a bench log has no money fact. Guard:
 * `packer.test.ts` parses this against the catalog.
 */
export const PACKER_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'packer.order_id',
  statusBindings: [{ fieldId: 'packer.tested' }, { fieldId: 'packer.packed' }],
  subtitleBindings: [
    { fieldId: 'packer.qty' },
    { fieldId: 'packer.condition' },
    { fieldId: 'packer.serial' },
    { fieldId: 'packer.sku' },
    { fieldId: 'packer.item_number' },
  ],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Packer bench entry. */
export const PACKER_TABLE_LAYOUT_ID = 'packer';
