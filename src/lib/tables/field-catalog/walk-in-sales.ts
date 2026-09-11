/**
 * Walk-in sales field catalog — bindable facts of one completed counter visit.
 *
 * Callers: `useWalkInSalesTableLayout` + `SLOT_LAYOUT_TABLES`.
 * Affected API: `/api/walk-in/sales` (row source only).
 * Data schemas: `SaleRow` in `@/lib/walk-in/transactions`.
 * User: completed visit appears as history on the Sales board slot table.
 *
 * Replaces `WalkInFeedPane` / `SalesTransactionsFeed` on dashboard Sales —
 * one PRODUCT_TABLES peer, not a second feed engine.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const WALKINSALES_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'walk-in-sales.id',
    family: 'walk-in-sales',
    label: 'Sale',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'id' },
  },
  {
    id: 'walk-in-sales.customer',
    family: 'walk-in-sales',
    label: 'Customer',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'customer_name' },
  },
  {
    id: 'walk-in-sales.detail',
    family: 'walk-in-sales',
    label: 'Lines',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'line_items' },
  },
  {
    id: 'walk-in-sales.amount',
    family: 'walk-in-sales',
    label: 'Total',
    displayType: 'money',
    slotKinds: ['subtitle', 'status'],
    paths: { value: 'total' },
  },
  {
    id: 'walk-in-sales.status',
    family: 'walk-in-sales',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'status' },
  },
  {
    id: 'walk-in-sales.created',
    family: 'walk-in-sales',
    label: 'Completed',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
  {
    id: 'walk-in-sales.source',
    family: 'walk-in-sales',
    label: 'Source',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'order_source' },
  },
];

/**
 * Product default — identity is the sale id; customer / status / source are
 * STATUS tracks; line money pins under the title via `{family}.amount`.
 * `created` stays catalogued for Dates chrome + Fields, not a duplicate track.
 */
export const WALKINSALES_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'walk-in-sales.id',
  statusBindings: [
    { fieldId: 'walk-in-sales.customer' },
    { fieldId: 'walk-in-sales.status' },
  ],
  subtitleBindings: [
    { fieldId: 'walk-in-sales.amount' },
    { fieldId: 'walk-in-sales.detail' },
  ],
  amountFieldId: null,
};

export const WALKINSALES_TABLE_LAYOUT_ID = 'walk-in-sales';
