/** Receiving field catalog — the bindable Unbox / History / Testing facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const RECEIVING_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'receiving.order',
    family: 'receiving',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { po: 'zoho_purchaseorder_number', ref: 'zoho_reference_number' },
  },
  {
    id: 'receiving.status',
    family: 'receiving',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'workflow_status' },
  },
  {
    id: 'receiving.qty',
    family: 'receiving',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { received: 'quantity_received', expected: 'quantity_expected' },
  },
  {
    id: 'receiving.price',
    family: 'receiving',
    label: 'Price',
    displayType: 'money',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'unit_price' },
  },
  {
    id: 'receiving.condition',
    family: 'receiving',
    label: 'Cond',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'condition_grade' },
  },
  // "Where the thing physically is" — the plan's §08 candidate, and on this
  // family the feed already carries it.
  {
    id: 'receiving.location',
    family: 'receiving',
    label: 'Location',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'staging_location_label' },
  },
  {
    id: 'receiving.tracking',
    family: 'receiving',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'tracking_number', carrier: 'carrier' },
  },
  {
    id: 'receiving.serial',
    family: 'receiving',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { units: 'serials', fallbackTitle: 'item_name' },
  },
];

/** The PRODUCT default receiving layout — the COMPOUND morph with **no bound fact tracks**, which is byte-for-byte what Unbox, History and… */
export const RECEIVING_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'receiving.order',
  statusBindings: [],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Receiving entry. */
export const RECEIVING_TABLE_LAYOUT_ID = 'receiving';
