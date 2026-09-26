/** Bin-utilization report field catalog — the bindable facts of ONE `mv_bin_utilization` row. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const REPORT_BIN_UTILIZATION_FIELD_CATALOG: FieldCatalog = [
  /** The IDENTITY fact — the bin's scannable handle. */
  {
    id: 'report-bin-utilization.bin',
    family: 'report-bin-utilization',
    label: 'Bin',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'barcode', fallback: 'bin_name' },
  },
  {
    id: 'report-bin-utilization.room',
    family: 'report-bin-utilization',
    label: 'Room',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'room' },
  },
  /** DERIVED — `paths` names the INPUT ratio, never a readable column. */
  {
    id: 'report-bin-utilization.fill',
    family: 'report-bin-utilization',
    label: 'Fill',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { ratio: 'fill_ratio' },
  },
  {
    id: 'report-bin-utilization.in_bin',
    family: 'report-bin-utilization',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'in_bin' },
  },
  {
    id: 'report-bin-utilization.capacity',
    family: 'report-bin-utilization',
    label: 'Cap',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'capacity' },
  },
  {
    id: 'report-bin-utilization.sku_count',
    family: 'report-bin-utilization',
    label: 'SKUs',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sku_count' },
  },
];

/** The PRODUCT default: */
export const REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'report-bin-utilization.bin',
  statusBindings: [
    { fieldId: 'report-bin-utilization.in_bin' },
    { fieldId: 'report-bin-utilization.capacity' },
    { fieldId: 'report-bin-utilization.sku_count' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Bin utilization. */
export const REPORT_BIN_UTILIZATION_TABLE_LAYOUT_ID = 'report-bin-utilization';
