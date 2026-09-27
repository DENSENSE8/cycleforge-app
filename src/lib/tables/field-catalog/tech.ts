/** Tech bench field catalog — the bindable facts of ONE test scan, as DATA. */

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
    /** The test scan itself — the bench's whole subject, and the one fact the flat model spent THREE tracks on (`tester` · `testedAt` · a… */
    id: 'tech.tested',
    family: 'tech',
    label: 'Tested',
    displayType: 'stage_event',
    slotKinds: ['status'],
    // Reused glyph, not a new key: `picked` is the bench-scan mark the slot
    // cell already owns (`SLOT_STEP_ICONS`).
    iconKey: 'picked',
    stageLabels: { done: 'Tested', pending: 'Test' },
    paths: { whoStaffId: 'tested_by', at: 'test_date_time' },
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

/** The PRODUCT default tech-bench layout: */
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
