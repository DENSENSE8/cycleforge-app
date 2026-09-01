/**
 * Catalog-link field catalog — the bindable listing-match facts, as DATA. Wave
 * 1.3's fifth family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `catalog-link` row:
 * "a review queue with a private compound model. Matching chores are facts;
 * the strip is slots.").
 *
 * Every entry names a fact `CatalogLinkChoreRow` already carries off
 * `/api/review/catalog-link`. Resolution is `./catalog-link-resolve.ts`, kept
 * separate so this module stays a LEAF.
 *
 * Catalog-link is a COMPOUND morph. `catalog-link.item` is the identity fact —
 * the marketplace item number, which the shared `fulfillment` chrome track
 * already paints.
 *
 * **`status` is deliberately absent.** The queue is the OPEN chores; the state
 * pill says "Unlinked" for every row because that is what being in this queue
 * means. A bound status column would paint one identical value on 100% of rows,
 * which is ink that teaches operators to stop reading chips — the same refusal
 * `incoming.zoho` earned. Add it the day a lane surfaces linked or ignored
 * rows, where the value actually varies.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

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
export const CATALOG_LINK_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'catalog-link.item',
  statusBindings: [],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — Review · Listing match. */
export const CATALOG_LINK_TABLE_LAYOUT_ID = 'catalog-link';
