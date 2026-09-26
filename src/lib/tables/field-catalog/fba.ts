/** FBA field catalog — the bindable Amazon-Prep board facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const FBA_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'fba.asin',
    family: 'fba',
    label: 'ASIN',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { id: 'asin' },
  },
  {
    id: 'fba.fnsku',
    family: 'fba',
    label: 'FNSKU',
    displayType: 'id',
    slotKinds: ['subtitle'],
    paths: { id: 'fnsku' },
  },
  {
    id: 'fba.qty',
    family: 'fba',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['subtitle'],
    paths: { actual: 'actual_qty', expected: 'expected_qty' },
  },
  {
    id: 'fba.condition',
    family: 'fba',
    label: 'Condition',
    displayType: 'tag',
    slotKinds: ['subtitle'],
    paths: { value: 'condition' },
  },
  {
    id: 'fba.notes',
    family: 'fba',
    label: 'Notes',
    displayType: 'note',
    slotKinds: ['subtitle'],
    paths: { text: 'item_notes' },
  },
  {
    id: 'fba.status',
    family: 'fba',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status'],
    paths: { value: 'item_status' },
  },
  {
    id: 'fba.due',
    family: 'fba',
    label: 'Due',
    displayType: 'date',
    slotKinds: ['status'],
    paths: { value: 'due_date' },
  },
  {
    id: 'fba.plan',
    family: 'fba',
    label: 'Plan',
    displayType: 'id',
    slotKinds: ['status'],
    paths: { ref: 'shipment_ref|amazon_shipment_id', destination: 'destination_fc' },
  },
];

/** The PRODUCT default FBA board layout — near-parity with the retired hand model's scan order (`select · asin · title · fnsku · qty ·… */
export const FBA_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'fba.asin',
  statusBindings: [
    { fieldId: 'fba.status' },
    { fieldId: 'fba.due' },
    { fieldId: 'fba.plan' },
  ],
  subtitleBindings: [
    { fieldId: 'fba.fnsku' },
    { fieldId: 'fba.qty' },
    { fieldId: 'fba.condition' },
  ],
  amountFieldId: null,
};

/** The one tableId this catalog will serve when the board display returns. */
export const FBA_TABLE_LAYOUT_ID = 'fba';
