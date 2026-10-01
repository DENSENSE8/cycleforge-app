/** Pickup field catalog — the bindable Local-pickup facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const PICKUP_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'pickup.order',
    family: 'pickup',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { orderId: 'po_number', fallbackId: 'order_id' },
  },
  {
    id: 'pickup.date',
    family: 'pickup',
    label: 'Date',
    displayType: 'date',
    slotKinds: ['status'],
    paths: { value: 'pickup_date' },
  },
  {
    id: 'pickup.status',
    family: 'pickup',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status'],
    paths: { value: 'order_status', receivingId: 'receiving_id' },
  },
  {
    id: 'pickup.sku',
    family: 'pickup',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['subtitle'],
    paths: { text: 'sku' },
  },
  {
    id: 'pickup.qty',
    family: 'pickup',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['subtitle'],
    paths: { value: 'quantity' },
  },
  {
    id: 'pickup.condition',
    family: 'pickup',
    label: 'Cond',
    displayType: 'tag',
    slotKinds: ['subtitle'],
    paths: { value: 'condition_grade' },
  },
  {
    id: 'pickup.price',
    family: 'pickup',
    label: 'Price',
    displayType: 'money',
    slotKinds: ['subtitle'],
    paths: { value: 'total_price' },
  },
  // The plan's §7.2 promise ("an org that cares about the customer binds it"):
  // the feed already carries the name; no default binding.
  {
    id: 'pickup.customer',
    family: 'pickup',
    label: 'Customer',
    displayType: 'text',
    slotKinds: ['subtitle'],
    paths: { text: 'customer_name' },
  },
];

/** The PRODUCT default pickup layout — visual parity with the retired hand model's CORE view (`select · title · order · date · status`): */
export const PICKUP_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'sheet',
  identityFieldId: 'pickup.order',
  statusBindings: [{ fieldId: 'pickup.date' }, { fieldId: 'pickup.status' }],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Local-pickup entry. */
export const PICKUP_TABLE_LAYOUT_ID = 'pickup';
