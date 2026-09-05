/**
 * Review · Listing match — column model for unmatched listings.
 *
 * Facts are content-hard and trailing `_fill` owns the sole `1fr`, from the one
 * declaration (`GRID_FILL_COLUMN`). Nothing here re-derives geometry.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  CATALOG_LINK_FIELD_CATALOG,
  CATALOG_LINK_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/catalog-link';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { ColumnType } from '@/lib/tables/table-columns';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';

export type CatalogLinkGridColumnKey =
  | 'select'
  | 'item'
  | 'source'
  | 'sku'
  | 'orders'
  | 'first'
  | 'last'
  /** Compound (two-row) presentation tracks — see {@link CATALOG_LINK_COMPOUND_COLUMNS}. */
  | 'thumb'
  | 'fulfillment'
  | 'dates'
  | 'state'
  | 'actions'
  | '_fill'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface CatalogLinkGridColumn extends SlotTrackFields {
  key: CatalogLinkGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  dateFace?: 'day' | 'stamp' | 'duration';
  align?: 'start' | 'end';
  frozen?: boolean;
  sortable?: boolean;
  hideKey?: string;
  tier?: 'core' | 'optional';
  resizable?: boolean;
  omitCellIcon?: boolean;
}

/**
 * Canonical Listing match columns, in scan order.
 *
 * `select` is a structural gutter with no verb of its own — a click opens the
 * catalog-link rail. `item` (the listing number) is the reading track and is
 * hideable because the compound mount already carries it as fulfillment.
 */

export function catalogLinkCompoundColumnsFor(
  layout: SlotLayout,
): readonly CatalogLinkGridColumn[] {
  return materializeTracks<CatalogLinkGridColumn>({
    layout,
    catalog: CATALOG_LINK_FIELD_CATALOG,
    base: compoundColumnsFor(),
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts.
 * With the product layout's empty band that is the shared `COMPOUND_TRACKS`
 * verbatim, so the port reproduces the review queue exactly and every catalog
 * fact becomes bindable without a deploy.
 */
export const CATALOG_LINK_COMPOUND_COLUMNS: readonly CatalogLinkGridColumn[] =
  catalogLinkCompoundColumnsFor(CATALOG_LINK_PRODUCT_LAYOUT);

/**
 * The `?colsort=` vocabulary.
 *
 * Two spellings reach the same fact and both are kept alive on purpose: the
 * FLAT words (`sku`, `orders`, `last`) are what live bookmarks carry, and the
 * compound TRACK keys (`fulfillment`, `state`) are what the mounted
 * header emits since wave 1.3. Dropping either half breaks somebody — a saved
 * link, or every header on the desk.
 *
 * `item` was missing from this list while the host's comparator already had a
 * `case 'item'`, so the queue's widest column offered a sort that
 * `useUrlColumnSort` then refused to store — the header moved and nothing
 * happened. That is the same class of dead-header bug `queue-display-sort`
 * documents for To-Ship; it is fixed by naming the track here.
 */
const CATALOG_LINK_GRID_SORTABLE_KEYS: readonly CatalogLinkGridColumnKey[] = [
  'dates',
  'source',
  'sku',
  'orders',
  'first',
  'last',
  'item',
  'fulfillment',
  'state',
];

export function isCatalogLinkGridSortable(key: string): key is CatalogLinkGridColumnKey {
  if (isSlotTableChromeTrack(key)) return false;
  return (CATALOG_LINK_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

/**
 * The comparator shape each sort word uses.
 *
 * Read off the FLAT column array until wave 1.3 moved the mount to compound
 * tracks, at which point `.find(c => c.key === 'state')` returned `undefined`
 * and every compound-track sort silently fell back to the default shape — a
 * date column comparing as text. Declared here so a word that has no flat twin
 * still names its own shape.
 */
export const CATALOG_LINK_SORT_TYPES: Readonly<Record<string, ColumnType>> = {
  dates: 'date',
  item: 'text',
  fulfillment: 'id',
  source: 'external',
  sku: 'id',
  orders: 'number',
  first: 'date',
  last: 'date',
  state: 'date',
};

export function defaultDirForCatalogLinkGridSort(key: CatalogLinkGridColumnKey): GridSortDir {
  return key === 'last' || key === 'first' || key === 'orders' || key === 'state'
    ? 'desc'
    : 'asc';
}
