/**
 * `sku-exceptions` family — the field catalog for Inventory › **SKU Exceptions**
 * (`/inventory/sku-exceptions`).
 *
 * One row = one floor-minted placeholder SKU (`TMP-<barcode>`): a product an
 * operator scanned into a location before the Zoho catalog knew it. The row's
 * IDENTITY is the placeholder SKU (the barcode rides under it), its TITLE is
 * the name typed on the phone with the description as the note, and the facts
 * are what a desk needs to pair it: how many are on hand, where they sit, and
 * whether anyone photographed it.
 *
 * | fact                          | painted as |
 * |-------------------------------|------------|
 * | `sku-exceptions.sku`          | the IDENTITY chip (`fulfillment` track) |
 * | `sku-exceptions.barcode`      | under the SKU (adapter `identitySubFace`) |
 * | `sku-exceptions.title`        | the item cell's TITLE |
 * | `sku-exceptions.description`  | under the title (adapter `note`) |
 * | `sku-exceptions.on_hand`      | `status:1` |
 * | `sku-exceptions.locations`    | `status:2` |
 * | `sku-exceptions.photos`       | `status:3` |
 * | `sku-exceptions.created_by`   | `status:4` |
 * | `sku-exceptions.state`        | the state pill (adapter chrome) |
 * | `sku-exceptions.created_at`   | the DATES chrome (day over clock) |
 *
 * `on_hand` is deliberately NOT `.qty`: `.qty` is the engine's line-qty name
 * and would be pinned under the title, where the description belongs.
 *
 * Resolution is `./sku-exceptions-resolve.ts`, kept separate so this module
 * stays a LEAF.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotTableFamily } from '@/lib/tables/slot-table-family';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const SKU_EXCEPTIONS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'sku-exceptions.sku',
    family: 'sku-exceptions',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku' },
  },
  /** The scanned barcode — the handle the gun read. Painted under the SKU. */
  {
    id: 'sku-exceptions.barcode',
    family: 'sku-exceptions',
    label: 'Barcode',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'barcode' },
  },
  {
    id: 'sku-exceptions.title',
    family: 'sku-exceptions',
    label: 'Item',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'productTitle' },
  },
  {
    id: 'sku-exceptions.description',
    family: 'sku-exceptions',
    label: 'Description',
    displayType: 'note',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'description' },
  },
  {
    id: 'sku-exceptions.on_hand',
    family: 'sku-exceptions',
    label: 'On hand',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'stock' },
  },
  /** Every location holding it, as `code ×qty` — the codes are searchable. */
  {
    id: 'sku-exceptions.locations',
    family: 'sku-exceptions',
    label: 'Locations',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'locations' },
  },
  {
    id: 'sku-exceptions.photos',
    family: 'sku-exceptions',
    label: 'Photos',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'photoCount' },
  },
  {
    id: 'sku-exceptions.created_by',
    family: 'sku-exceptions',
    label: 'Created by',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { id: 'createdByStaffId', name: 'createdByName' },
  },
  /** `Needs photo` until one exists, else `On hold` — see `skuExceptionState`. */
  {
    id: 'sku-exceptions.state',
    family: 'sku-exceptions',
    label: 'State',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { photos: 'photoCount' },
  },
  {
    id: 'sku-exceptions.created_at',
    family: 'sku-exceptions',
    label: 'Created',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'createdAt' },
  },
];

/**
 * The PRODUCT default. Six of ten facts ride chrome (identity, sub-identity,
 * title, note, state, dates), so the four status slots carry the pairing
 * facts. No subtitle bindings: an empty subtitle band is what lets the
 * adapter's `note` (the description) paint under the title.
 *
 * Guard: `sku-exceptions.test.ts` parses this against the catalog.
 */
export const SKU_EXCEPTIONS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'sku-exceptions.sku',
  statusBindings: [
    { fieldId: 'sku-exceptions.on_hand' },
    { fieldId: 'sku-exceptions.locations' },
    { fieldId: 'sku-exceptions.photos' },
    { fieldId: 'sku-exceptions.created_by' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The tableId this catalog serves — `PRODUCT_TABLES`' SKU-exceptions entry. */
export const SKU_EXCEPTIONS_TABLE_LAYOUT_ID = 'sku-exceptions';

/** The FAMILY RECORD — everything the engine needs to mount this desk, as data. */
export const SKU_EXCEPTIONS_FAMILY: SlotTableFamily = {
  tableId: SKU_EXCEPTIONS_TABLE_LAYOUT_ID,
  catalog: SKU_EXCEPTIONS_FIELD_CATALOG,
  productLayout: SKU_EXCEPTIONS_PRODUCT_LAYOUT,
  paintMorph: 'compound',
  identityFallbackLabel: 'SKU',
  bandLabels: { status: 'Exception columns', subtitle: 'Under the item' },
  chrome: {
    fulfillment: { field: 'sku-exceptions.sku' },
    item: { field: 'sku-exceptions.title' },
    dates: { field: 'sku-exceptions.created_at' },
    state: { field: 'sku-exceptions.state' },
  },
};
