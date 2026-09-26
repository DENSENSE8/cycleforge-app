/** Part-compatibility field catalog — the bindable facts of one model ↔ part edge. */

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
  /** When the edge was LINKED — the compound DATES chrome's fact. */
  {
    id: 'part-compatibility.linked',
    family: 'part-compatibility',
    label: 'Linked',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
];

/** The PRODUCT default — byte-for-byte the facts the retired table painted, with the merged pill split in two. */
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
