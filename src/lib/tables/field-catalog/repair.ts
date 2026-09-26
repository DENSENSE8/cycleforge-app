/** Repair field catalog — the bindable walk-in / repair-desk facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const REPAIR_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'repair.service',
    family: 'repair',
    label: 'Service',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'id' },
  },
  {
    id: 'repair.created',
    family: 'repair',
    label: 'Created',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
  {
    id: 'repair.customer',
    family: 'repair',
    label: 'Customer',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { name: 'customer_name', fallback: 'contact_info' },
  },
  // Contact detail — and PII — that only matters once you open the ticket.
  {
    id: 'repair.phone',
    family: 'repair',
    label: 'Phone',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { phone: 'customer_phone', fallback: 'contact_info' },
  },
  {
    id: 'repair.price',
    family: 'repair',
    label: 'Price',
    displayType: 'money',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'price' },
  },
  // Reads "Walk-in" on the overwhelming majority of rows, so as a DEFAULT track it is a near-constant column — the same argument that keeps…
  {
    id: 'repair.order',
    family: 'repair',
    label: 'Walk-in / Order',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'source_order_id' },
  },
  {
    id: 'repair.ticket',
    family: 'repair',
    label: 'Ticket',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'ticket_number' },
  },
  {
    id: 'repair.status',
    family: 'repair',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'status' },
  },
];

/** The PRODUCT default repair layout — visual parity with the retired hand model's CORE view (`select · title · created · customer · ticket`): */
export const REPAIR_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'repair.service',
  statusBindings: [
    { fieldId: 'repair.created' },
    { fieldId: 'repair.customer' },
    { fieldId: 'repair.ticket' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Repair queue entry. */
export const REPAIR_TABLE_LAYOUT_ID = 'repair';
