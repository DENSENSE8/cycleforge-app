/** Packer bench field catalog — the bindable facts of ONE pack scan, as DATA. */

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

/** The PRODUCT default packer-bench layout: */
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
