/** Order-import-staging field catalog — the bindable staged-row facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const ORDERS_IMPORT_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'orders-import.order',
    family: 'orders-import',
    label: 'Order number',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'orderNumber' },
  },
  {
    id: 'orders-import.sku',
    family: 'orders-import',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'orders-import.qty',
    family: 'orders-import',
    label: 'Quantity',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'quantity' },
  },
  {
    id: 'orders-import.customer',
    family: 'orders-import',
    label: 'Customer',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'customerName' },
  },
  {
    id: 'orders-import.tracking',
    family: 'orders-import',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'trackingNumber' },
  },
  {
    id: 'orders-import.platform',
    family: 'orders-import',
    label: 'Platform',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'platform' },
  },
];

/** The PRODUCT default staging layout — visual parity with the retired hand model (`select · order · status · sku · qty · customer ·… */
export const ORDERS_IMPORT_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'orders-import.order',
  statusBindings: [
    { fieldId: 'orders-import.sku' },
    { fieldId: 'orders-import.qty' },
    { fieldId: 'orders-import.customer' },
    { fieldId: 'orders-import.tracking' },
    { fieldId: 'orders-import.platform' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — the staging grid's own prefs bucket. */
export const ORDERS_IMPORT_TABLE_LAYOUT_ID = 'orders-import';
