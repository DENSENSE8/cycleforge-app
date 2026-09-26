/** Admin › Holds field catalog — the bindable facts of ONE quarantined unit. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const ADMINHOLDS_FIELD_CATALOG: FieldCatalog = [
  { id: 'admin-holds.unit', family: 'admin-holds', label: 'Unit', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'id' } },
  { id: 'admin-holds.serial', family: 'admin-holds', label: 'Serial', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'serial_number' } },
  { id: 'admin-holds.sku', family: 'admin-holds', label: 'SKU', displayType: 'id', slotKinds: ['status', 'subtitle'], paths: { value: 'sku' } },
  { id: 'admin-holds.restore_status', family: 'admin-holds', label: 'Restore to', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'restore_status' } },
  { id: 'admin-holds.hold_reason', family: 'admin-holds', label: 'Reason', displayType: 'note', slotKinds: ['status', 'subtitle'], paths: { value: 'hold_reason' } },
  { id: 'admin-holds.held_at', family: 'admin-holds', label: 'Held at', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'held_at' } },
  { id: 'admin-holds.held_by', family: 'admin-holds', label: 'Held by', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { display: 'held_by_name', name: 'held_by_name', value: 'held_by_staff_id' } },
];

/** The PRODUCT default: */
export const ADMINHOLDS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'admin-holds.unit',
  statusBindings: [
    { fieldId: 'admin-holds.sku' },
    { fieldId: 'admin-holds.held_by' },
  ],
  subtitleBindings: [{ fieldId: 'admin-holds.hold_reason' }],
  amountFieldId: null,
};

export const ADMINHOLDS_TABLE_LAYOUT_ID = 'admin-holds';
