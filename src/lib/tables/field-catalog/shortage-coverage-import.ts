/**
 * Shortage-coverage-import field catalog — staged Amazon OOS / backorder
 * demand rows. Own prefs bucket: hiding a staging column must not densify
 * live Shortage / To-ship.
 *
 * Coverage is a DATA fact whose face is {@link formatShortageCoverage} (the
 * same string the live Shortage row paints). Status (Ready / Action required)
 * is structural, not a catalog field — same law as orders-import.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const SHORTAGE_COVERAGE_IMPORT_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'shortage-coverage-import.order',
    family: 'shortage-coverage-import',
    label: 'Order number',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'orderNumber' },
  },
  {
    id: 'shortage-coverage-import.title',
    family: 'shortage-coverage-import',
    label: 'Product',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'itemTitle' },
  },
  {
    id: 'shortage-coverage-import.qty',
    family: 'shortage-coverage-import',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'shortQty' },
  },
  {
    id: 'shortage-coverage-import.coverage',
    family: 'shortage-coverage-import',
    label: 'Coverage',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'coverageLabel' },
  },
  {
    id: 'shortage-coverage-import.po',
    family: 'shortage-coverage-import',
    label: 'PO',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'poNumber' },
  },
  {
    id: 'shortage-coverage-import.inbound',
    family: 'shortage-coverage-import',
    label: 'Inbound',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'inboundTracking' },
  },
];

export const SHORTAGE_COVERAGE_IMPORT_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'shortage-coverage-import.order',
  statusBindings: [
    { fieldId: 'shortage-coverage-import.title' },
    { fieldId: 'shortage-coverage-import.qty' },
    { fieldId: 'shortage-coverage-import.coverage' },
    { fieldId: 'shortage-coverage-import.po' },
    { fieldId: 'shortage-coverage-import.inbound' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

export const SHORTAGE_COVERAGE_IMPORT_TABLE_LAYOUT_ID = 'shortage-coverage-import';
