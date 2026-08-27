/**
 * Review · Listing match — column model for unmatched listings.
 *
 * Facts are content-hard and trailing `_fill` owns the sole `1fr`, from the one
 * declaration (`GRID_FILL_COLUMN`). Nothing here re-derives geometry.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import { GRID_FILL_COLUMN } from '@/design-system/components/grid';
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
  | 'state'
  | 'amount'
  | 'actions'
  | '_fill';

export interface CatalogLinkGridColumn {
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
export const CATALOG_LINK_GRID_COLUMNS: readonly CatalogLinkGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'item',
    width: 'minmax(12rem, 12rem)',
    label: 'Item number',
    type: 'id',
    hideKey: 'item',
    resizable: true,
    omitCellIcon: true,
    labelFitRem: 7,
  },
  {
    key: 'source',
    width: 'minmax(6rem, 6rem)',
    label: 'Account',
    type: 'external',
    hideKey: 'source',
    labelFitRem: 5,
  },
  {
    key: 'sku',
    width: 'minmax(8rem, 8rem)',
    label: 'SKU',
    type: 'id',
    hideKey: 'sku',
    resizable: true,
    omitCellIcon: true,
    labelFitRem: 4,
  },
  {
    key: 'orders',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Orders',
    type: 'number',
    align: 'end',
    hideKey: 'orders',
    labelFitRem: 4.5,
  },
  {
    key: 'first',
    width: 'minmax(7rem, 7rem)',
    label: 'First seen',
    type: 'date',
    dateFace: 'stamp',
    hideKey: 'first',
    tier: 'optional',
    labelFitRem: 6,
  },
  {
    key: 'last',
    width: 'minmax(7rem, 7rem)',
    label: 'Last seen',
    type: 'date',
    dateFace: 'stamp',
    hideKey: 'last',
    labelFitRem: 6,
  },
  GRID_FILL_COLUMN,
] as const;

export const CATALOG_LINK_COMPOUND_COLUMNS: readonly CatalogLinkGridColumn[] =
  compoundColumnsFor<CatalogLinkGridColumn>();

const CATALOG_LINK_GRID_SORTABLE_KEYS: readonly CatalogLinkGridColumnKey[] = [
  ...CATALOG_LINK_GRID_COLUMNS.filter((c) => c.sortable !== false && c.key !== 'select').map(
    (c) => c.key,
  ),
  'fulfillment',
  'state',
  'amount',
];

export function isCatalogLinkGridSortable(key: string): key is CatalogLinkGridColumnKey {
  return (CATALOG_LINK_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function defaultDirForCatalogLinkGridSort(key: CatalogLinkGridColumnKey): GridSortDir {
  return key === 'last' || key === 'first' || key === 'orders' || key === 'amount' || key === 'state'
    ? 'desc'
    : 'asc';
}
