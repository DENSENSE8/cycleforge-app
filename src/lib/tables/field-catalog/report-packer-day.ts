/**
 * Packer-day report field catalog — the bindable facts of ONE PACK (`/reports?tab=packer`).
 * `<table>` under a strip of KPI tiles. The operator's verdict (2026-09-16):
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const REPORT_PACKER_DAY_FIELD_CATALOG: FieldCatalog = [
  /** Packer attribution — a `person`, bound to status or subtitle tracks. */
  {
    id: 'report-packer-day.packer',
    family: 'report-packer-day',
    label: 'Packer',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { display: 'packerName', name: 'packerName', value: 'packerStaffId' },
  },
  {
    id: 'report-packer-day.product',
    family: 'report-packer-day',
    label: 'Product',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'productTitle' },
  },
  /** The compound DATES chrome's fact — the instant the pack scan landed. */
  {
    id: 'report-packer-day.packed_at',
    family: 'report-packer-day',
    label: 'Packed at',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'packedAt' },
  },
  {
    id: 'report-packer-day.item_number',
    family: 'report-packer-day',
    label: 'Item #',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'itemNumber' },
  },
  {
    id: 'report-packer-day.sku',
    family: 'report-packer-day',
    label: 'SKU',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sku' },
  },
  /** The standard this pack was weighted at, in whole minutes. */
  {
    id: 'report-packer-day.minutes',
    family: 'report-packer-day',
    label: 'Time to pack',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'estimatedMinutes' },
  },
  {
    id: 'report-packer-day.tier',
    family: 'report-packer-day',
    label: 'Tier',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'packTier' },
  },
  /** Where the standard came from — the trust fact. See the module doc. */
  {
    id: 'report-packer-day.basis',
    family: 'report-packer-day',
    label: 'Basis',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'tierSource' },
  },
  /**
   * The ORDER NUMBER — the identity fact, and what the Id chip's first line paints.
   * digits on both of its lines (operator 2026-09-16).
   */
  {
    id: 'report-packer-day.order_number',
    family: 'report-packer-day',
    label: 'Order #',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'orderNumber' },
  },
  /** The carrier tracking / raw scan ref — the chip's SECOND line. */
  {
    id: 'report-packer-day.order_ref',
    family: 'report-packer-day',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'trackingOrScanRef' },
  },
];

/** The PRODUCT default: */
export const REPORT_PACKER_DAY_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'report-packer-day.order_number',
  statusBindings: [
    { fieldId: 'report-packer-day.packer' },
    { fieldId: 'report-packer-day.item_number' },
    { fieldId: 'report-packer-day.sku' },
    { fieldId: 'report-packer-day.minutes' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Packer-day entry. */
export const REPORT_PACKER_DAY_TABLE_LAYOUT_ID = 'report-packer-day';
