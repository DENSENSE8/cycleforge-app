/** Per-SKU bin-distribution field catalog — the bindable facts of ONE `bin_contents` row, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableFamily } from '@/lib/tables/data-table-family';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const SKU_BINS_FIELD_CATALOG: FieldCatalog = [
  /** The IDENTITY fact — which bin. */
  {
    id: 'sku-bins.bin',
    family: 'sku-bins',
    label: 'Bin',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { name: 'bin_name', barcode: 'bin_barcode', location: 'location_id' },
  },
  /** The page's subject, on the structural title cell. See the docblock. */
  {
    id: 'sku-bins.item',
    family: 'sku-bins',
    label: 'Item',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { title: 'product_title', sku: 'sku' },
  },
  {
    id: 'sku-bins.qty',
    family: 'sku-bins',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'qty' },
  },
  {
    id: 'sku-bins.min_qty',
    family: 'sku-bins',
    label: 'Min',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'min_qty' },
  },
  {
    id: 'sku-bins.max_qty',
    family: 'sku-bins',
    label: 'Max',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'max_qty' },
  },
  /**
   * SINGLE-valued, unlike `bins.status` — which joins up to four independent
   * flags into `Low · Stale` and therefore refuses to sort. One word sorts
   * like any other resolved fact, so this header stays live.
   */
  {
    id: 'sku-bins.level',
    family: 'sku-bins',
    label: 'Level',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { qty: 'qty', min: 'min_qty', max: 'max_qty' },
  },
  {
    id: 'sku-bins.last_counted',
    family: 'sku-bins',
    label: 'Counted',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_counted' },
  },
];

/** The PRODUCT default: */
export const SKU_BINS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'sku-bins.bin',
  statusBindings: [
    { fieldId: 'sku-bins.qty' },
    { fieldId: 'sku-bins.min_qty' },
    { fieldId: 'sku-bins.max_qty' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The tableId this catalog serves — `PRODUCT_TABLES`' per-SKU bins entry. */
export const SKU_BINS_TABLE_LAYOUT_ID = 'sku-bins';

/** The FAMILY RECORD — everything the engine needs to mount this pane, as data. */
export const SKU_BINS_FAMILY: DataTableFamily = {
  tableId: SKU_BINS_TABLE_LAYOUT_ID,
  catalog: SKU_BINS_FIELD_CATALOG,
  productLayout: SKU_BINS_PRODUCT_LAYOUT,
  /**
   * Compound only: a stored `sheet` layout would open `subtitle:N` tracks the
   * compound item cell paints inline. `paintMorph` coerces, and the org write
   * gate (`slotMorphsFor('sku-bins')`) refuses the foreign morph.
   */
  paintMorph: 'compound',
  identityFallbackLabel: 'Bin',
  bandLabels: { status: 'Bin columns', subtitle: 'Under the item' },
  chrome: {
    fulfillment: { field: 'sku-bins.bin' },
    item: { field: 'sku-bins.item' },
    /** "Which of this SKU's bins has not been counted in a while." */
    dates: { field: 'sku-bins.last_counted' },
    /** The pill: qty read against this pair's own min/max. */
    state: { field: 'sku-bins.level' },
  },
};
