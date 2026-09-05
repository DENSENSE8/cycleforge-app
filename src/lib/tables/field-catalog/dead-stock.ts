/**
 * Dead-stock field catalog — 90d+ dormancy ranking on Reports.
 * Sibling of sku-velocity: same grain (SKU), different question.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const DEAD_STOCK_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'dead-stock.sku',
    family: 'dead-stock',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'sku' },
  },
  {
    id: 'dead-stock.product',
    family: 'dead-stock',
    label: 'Product',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'product_title' },
  },
  {
    id: 'dead-stock.days',
    family: 'dead-stock',
    label: 'Days dormant',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'days_dormant' },
  },
  {
    id: 'dead-stock.stock',
    family: 'dead-stock',
    label: 'Stock',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'stock' },
  },
];

export const DEAD_STOCK_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'dead-stock.sku',
  statusBindings: [
    { fieldId: 'dead-stock.product' },
    { fieldId: 'dead-stock.days' },
  ],
  subtitleBindings: [{ fieldId: 'dead-stock.stock' }],
  amountFieldId: null,
};

export const DEAD_STOCK_TABLE_LAYOUT_ID = 'dead-stock';
