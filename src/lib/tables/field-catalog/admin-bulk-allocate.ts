/** Bulk-allocate field catalog — the bindable facts of ONE allocation candidate (an unallocated `orders` row beside its SKU's STOCKED count). */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const ADMIN_BULK_ALLOCATE_FIELD_CATALOG: FieldCatalog = [
  { id: 'admin-bulk-allocate.order_id', family: 'admin-bulk-allocate', label: 'Order id', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'order_id' } },
  { id: 'admin-bulk-allocate.ext_id', family: 'admin-bulk-allocate', label: 'Ext id', displayType: 'id', slotKinds: ['status', 'subtitle'], paths: { value: 'order_id_text' } },
  { id: 'admin-bulk-allocate.sku', family: 'admin-bulk-allocate', label: 'SKU', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'sku' } },
  { id: 'admin-bulk-allocate.condition', family: 'admin-bulk-allocate', label: 'Condition', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'condition' } },
  // DERIVED — no `paths`. The page's floor-clamped parse of the TEXT column
  // `orders.quantity`; `.qty` + number + subtitle is what pins it under the
  // title as line-qty identity (`ensureLineQtySubtitle`).
  { id: 'admin-bulk-allocate.qty', family: 'admin-bulk-allocate', label: 'Qty', displayType: 'number', slotKinds: ['status', 'subtitle'] },
  { id: 'admin-bulk-allocate.available_stocked', family: 'admin-bulk-allocate', label: 'Available STOCKED', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'available_stocked' } },
  // DERIVED — no `paths`. `available_stocked >= qty`, as the pill's word.
  { id: 'admin-bulk-allocate.eligible', family: 'admin-bulk-allocate', label: 'Allocatable', displayType: 'tag', slotKinds: ['status', 'subtitle'] },
  { id: 'admin-bulk-allocate.ordered', family: 'admin-bulk-allocate', label: 'Ordered', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'order_date', fallback: 'created_at' } },
];

/** The PRODUCT default: */
export const ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'admin-bulk-allocate.order_id',
  statusBindings: [
    { fieldId: 'admin-bulk-allocate.ext_id' },
    { fieldId: 'admin-bulk-allocate.available_stocked' },
  ],
  subtitleBindings: [
    { fieldId: 'admin-bulk-allocate.qty' },
    { fieldId: 'admin-bulk-allocate.condition' },
  ],
  amountFieldId: null,
};

export const ADMIN_BULK_ALLOCATE_TABLE_LAYOUT_ID = 'admin-bulk-allocate';
