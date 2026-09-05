/**
 * Compatibility field catalog — the bindable facts of one part-to-model rule.
 *
 * Off `AdminTable` 2026-09-05. Rule deletion was a trailing ACTIONS cell; it is
 * a row verb now.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const COMPATIBILITY_FIELD_CATALOG: FieldCatalog = [
  { id: 'compatibility.id', family: 'compatibility', label: 'Rule', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'id' } },
  { id: 'compatibility.part', family: 'compatibility', label: 'Part', displayType: 'id', slotKinds: ['status', 'subtitle'], paths: { value: 'sku', title: 'product_title' } },
  { id: 'compatibility.model', family: 'compatibility', label: 'Model', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'model_number', name: 'model_name' } },
  { id: 'compatibility.kind', family: 'compatibility', label: 'Role', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'part_role' } },
  { id: 'compatibility.fit', family: 'compatibility', label: 'Fit', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'fit' } },
  { id: 'compatibility.confidence', family: 'compatibility', label: 'Confidence', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'confidence' } },
  { id: 'compatibility.source', family: 'compatibility', label: 'Source', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'source' } },
  { id: 'compatibility.oem', family: 'compatibility', label: 'OEM', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'is_oem' } },
];

export const COMPATIBILITY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'compatibility.id',
  statusBindings: [
    { fieldId: 'compatibility.model' },
    { fieldId: 'compatibility.fit' },
    { fieldId: 'compatibility.confidence' },
    { fieldId: 'compatibility.oem' },
    { fieldId: 'compatibility.source' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

export const COMPATIBILITY_TABLE_LAYOUT_ID = 'compatibility';
