/**
 * SKU velocity field catalog — 30-day in/out ranking on Reports.
 * Sibling of dead-stock: same grain (SKU), different question.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const SKU_VELOCITY_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'sku-velocity.sku',
    family: 'sku-velocity',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'sku' },
  },
  {
    id: 'sku-velocity.product',
    family: 'sku-velocity',
    label: 'Product',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'product_title' },
  },
  {
    id: 'sku-velocity.tier',
    family: 'sku-velocity',
    label: 'Tier',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'velocity_tier' },
  },
  {
    id: 'sku-velocity.out',
    family: 'sku-velocity',
    label: 'Out',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'out_qty' },
  },
  {
    id: 'sku-velocity.in',
    family: 'sku-velocity',
    label: 'In',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'in_qty' },
  },
  {
    id: 'sku-velocity.stock',
    family: 'sku-velocity',
    label: 'Stock',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'current_stock' },
  },
];

export const SKU_VELOCITY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'sku-velocity.sku',
  // Product is the item TITLE (adapter), not a fourth status track — four
  // bound statuses plus chrome would exceed MAX_DEFAULT_VISIBLE_TRACKS.
  statusBindings: [
    { fieldId: 'sku-velocity.tier' },
    { fieldId: 'sku-velocity.out' },
    { fieldId: 'sku-velocity.in' },
  ],
  subtitleBindings: [{ fieldId: 'sku-velocity.stock' }],
  amountFieldId: null,
};

export const SKU_VELOCITY_TABLE_LAYOUT_ID = 'sku-velocity';
