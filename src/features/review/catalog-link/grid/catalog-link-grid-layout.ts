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
  /** Legacy URL `?colsort=amount` bookmark — not a chrome track. */
  | 'amount'
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

/** Canonical Listing match columns, in scan order. */
export function catalogLinkCompoundColumnsFor(
  layout: SlotLayout,
): readonly CatalogLinkGridColumn[] {
  return materializeTracks<CatalogLinkGridColumn>({
    layout,
    catalog: CATALOG_LINK_FIELD_CATALOG,
    base: compoundColumnsFor<CatalogLinkGridColumn>(),
  });
}

/** The PRODUCT-DEFAULT materialization — what an org with no override mounts. */
export const CATALOG_LINK_COMPOUND_COLUMNS: readonly CatalogLinkGridColumn[] =
  catalogLinkCompoundColumnsFor(CATALOG_LINK_PRODUCT_LAYOUT);

/** The `?colsort=` vocabulary. */
const CATALOG_LINK_GRID_SORTABLE_KEYS: readonly CatalogLinkGridColumnKey[] = [
  'item',
  'source',
  'sku',
  'orders',
  'first',
  'last',
  'fulfillment',
  'dates',
  'state',
];

export function isCatalogLinkGridSortable(key: string): key is CatalogLinkGridColumnKey {
  return (CATALOG_LINK_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

/** The comparator shape each sort word uses. */
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
