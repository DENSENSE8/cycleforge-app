/** SKU stock-drift field catalog — the bindable facts of ONE `v_sku_stock_drift` row. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const ADMIN_SKU_DRIFT_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'admin-sku-drift.sku',
    family: 'admin-sku-drift',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'admin-sku-drift.warehouse_drift',
    family: 'admin-sku-drift',
    label: 'Δ WH',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'warehouse_drift' },
  },
  {
    id: 'admin-sku-drift.boxed_drift',
    family: 'admin-sku-drift',
    label: 'Δ Boxed',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'boxed_drift' },
  },
  {
    id: 'admin-sku-drift.stored_warehouse',
    family: 'admin-sku-drift',
    label: 'Stored WH',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'stored_stock' },
  },
  {
    id: 'admin-sku-drift.ledger_warehouse',
    family: 'admin-sku-drift',
    label: 'Ledger WH',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'ledger_warehouse' },
  },
  {
    id: 'admin-sku-drift.stored_boxed',
    family: 'admin-sku-drift',
    label: 'Stored Boxed',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'stored_boxed' },
  },
  {
    id: 'admin-sku-drift.ledger_boxed',
    family: 'admin-sku-drift',
    label: 'Ledger Boxed',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'ledger_boxed' },
  },
];

/** The PRODUCT default: */
export const ADMIN_SKU_DRIFT_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'admin-sku-drift.sku',
  statusBindings: [
    { fieldId: 'admin-sku-drift.stored_warehouse' },
    { fieldId: 'admin-sku-drift.ledger_warehouse' },
    { fieldId: 'admin-sku-drift.stored_boxed' },
    { fieldId: 'admin-sku-drift.ledger_boxed' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' SKU-drift entry. */
export const ADMIN_SKU_DRIFT_TABLE_LAYOUT_ID = 'admin-sku-drift';
