/** Dead-stock report field catalog — the bindable facts of ONE dormant-SKU row (90 days or more without a ledger write). */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const REPORT_DEAD_STOCK_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact. `displayType: 'id'` is what `parseSlotLayout` requires
   * of an identity, and it is what makes the fulfillment cell paint an ID face
   * rather than prose.
   */
  {
    id: 'report-dead-stock.sku',
    family: 'report-dead-stock',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'report-dead-stock.product',
    family: 'report-dead-stock',
    label: 'Product',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'product_title' },
  },
  {
    id: 'report-dead-stock.stock',
    family: 'report-dead-stock',
    label: 'Stock',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'stock' },
  },
  {
    id: 'report-dead-stock.days_dormant',
    family: 'report-dead-stock',
    label: 'Dormant',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'days_dormant' },
  },
  /** The compound DATES chrome's fact — see the docblock. */
  {
    id: 'report-dead-stock.last_move',
    family: 'report-dead-stock',
    label: 'Last move',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_move_at' },
  },
];

/** The PRODUCT default: */
export const REPORT_DEAD_STOCK_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'report-dead-stock.sku',
  statusBindings: [{ fieldId: 'report-dead-stock.stock' }],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Dead stock entry. */
export const REPORT_DEAD_STOCK_TABLE_LAYOUT_ID = 'report-dead-stock';
