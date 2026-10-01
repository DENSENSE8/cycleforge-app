/** Catalog-link field catalog — the bindable listing-match facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const CATALOG_LINK_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'catalog-link.item',
    family: 'catalog-link',
    label: 'Item #',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'itemNumber' },
  },
  {
    id: 'catalog-link.source',
    family: 'catalog-link',
    label: 'Source',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'accountSource' },
  },
  {
    id: 'catalog-link.sku',
    family: 'catalog-link',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sku' },
  },
  // How much this chore is BLOCKING — the number that decides which unlinked
  // listing an operator fixes first.
  {
    id: 'catalog-link.orders',
    family: 'catalog-link',
    label: 'Orders',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'orderCount' },
  },
  {
    id: 'catalog-link.first',
    family: 'catalog-link',
    label: 'First seen',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'firstSeenAt' },
  },
  {
    id: 'catalog-link.last',
    family: 'catalog-link',
    label: 'Last seen',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'lastSeenAt' },
  },
];

/**
 * The PRODUCT default catalog-link layout — COMPOUND morph, nothing bound,
 * which is byte-for-byte what the review queue paints today. Reproduce, then
 * improve. Guard: `catalog-link.test.ts` parses this against the catalog.
 */
export const CATALOG_LINK_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'catalog-link.item',
  statusBindings: [],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — Review · Listing match. */
export const CATALOG_LINK_TABLE_LAYOUT_ID = 'catalog-link';
