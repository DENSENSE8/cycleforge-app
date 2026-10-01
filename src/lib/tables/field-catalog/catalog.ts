/** Products-catalog field catalog — the bindable SKU-catalog facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const CATALOG_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'catalog.title',
    family: 'catalog',
    label: 'Product',
    displayType: 'text',
    slotKinds: ['subtitle'],
    paths: { value: 'display_title' },
  },
  {
    id: 'catalog.sku',
    family: 'catalog',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'sku' },
  },
  // Whether the product is wired to the inventory master — the catalog's whole
  // job, and the axis the Filter popover slices on.
  {
    id: 'catalog.inventory',
    family: 'catalog',
    label: 'Inventory',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: {
      linked: 'is_inventory_linked',
      title: 'inventory_title',
      providerId: 'provider_item_id',
    },
  },
  {
    id: 'catalog.channels',
    family: 'catalog',
    label: 'Channels',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'platform_count' },
  },
  {
    id: 'catalog.platforms',
    family: 'catalog',
    label: 'Platforms',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'platform_ids' },
  },
  {
    id: 'catalog.item_numbers',
    family: 'catalog',
    label: 'Item numbers',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'platform_ids' },
  },
  {
    id: 'catalog.manuals',
    family: 'catalog',
    label: 'Manuals',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'manual_count' },
  },
  {
    id: 'catalog.qc',
    family: 'catalog',
    label: 'QC',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'qc_step_count' },
  },
  {
    id: 'catalog.orders',
    family: 'catalog',
    label: 'Orders',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'order_count' },
  },
  {
    id: 'catalog.status',
    family: 'catalog',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: {
      lifecycle: 'lifecycle_status',
      active: 'is_active',
      pending: 'has_pending_action',
    },
  },
  // The plan's §08 names cost as the missing seller fact, and observes that the nearest one in the schema "lives on the SKU catalog and is…
  {
    id: 'catalog.cost',
    family: 'catalog',
    label: 'Last cost',
    displayType: 'money',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_known_cost_cents' },
  },
  {
    id: 'catalog.category',
    family: 'catalog',
    label: 'Category',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'category' },
  },
];

/** The PRODUCT default catalog layout — visual parity with the retired hand model's CORE view (`select · title · sku · inventory · status`): */
export const CATALOG_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'sheet',
  identityFieldId: 'catalog.sku',
  statusBindings: [{ fieldId: 'catalog.inventory' }, { fieldId: 'catalog.status' }],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Products catalog entry. */
export const CATALOG_TABLE_LAYOUT_ID = 'catalog';
