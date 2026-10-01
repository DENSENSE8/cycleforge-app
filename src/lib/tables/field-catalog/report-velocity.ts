/** SKU-velocity report field catalog — the bindable facts of ONE 30-day movement row. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const REPORT_VELOCITY_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact. `displayType: 'id'` is required for an identity and
   * makes the fulfillment cell paint an ID face
   * rather than prose.
   */
  {
    id: 'report-velocity.sku',
    family: 'report-velocity',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'report-velocity.product',
    family: 'report-velocity',
    label: 'Product',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'product_title' },
  },
  {
    id: 'report-velocity.tier',
    family: 'report-velocity',
    label: 'Tier',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'velocity_tier' },
  },
  {
    id: 'report-velocity.out_qty',
    family: 'report-velocity',
    label: 'Out',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'out_qty' },
  },
  {
    id: 'report-velocity.in_qty',
    family: 'report-velocity',
    label: 'In',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'in_qty' },
  },
  {
    id: 'report-velocity.stock',
    family: 'report-velocity',
    label: 'Stock',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'current_stock' },
  },
  /** The compound DATES chrome's fact — see the docblock. */
  {
    id: 'report-velocity.last_move',
    family: 'report-velocity',
    label: 'Last move',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_move_at' },
  },
];

/** The PRODUCT default: */
export const REPORT_VELOCITY_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'report-velocity.sku',
  statusBindings: [
    { fieldId: 'report-velocity.out_qty' },
    { fieldId: 'report-velocity.in_qty' },
    { fieldId: 'report-velocity.stock' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Velocity entry. */
export const REPORT_VELOCITY_TABLE_LAYOUT_ID = 'report-velocity';
