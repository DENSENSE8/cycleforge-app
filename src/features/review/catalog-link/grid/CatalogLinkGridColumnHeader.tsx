'use client';

import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  CATALOG_LINK_GRID_COLUMNS,
  isCatalogLinkGridSortable,
  type CatalogLinkGridColumn,
  type CatalogLinkGridColumnKey,
} from './catalog-link-grid-layout';

const CATALOG_LINK_HEADER_LAYOUT: LedgerHeaderLayoutApi = {
  isSortable: isCatalogLinkGridSortable,
};

export const CatalogLinkGridColumnHeader = makeLedgerGridColumnHeader<
  CatalogLinkGridColumn,
  CatalogLinkGridColumnKey,
  'prop'
>({
  layout: CATALOG_LINK_HEADER_LAYOUT,
  defaultColumns: CATALOG_LINK_GRID_COLUMNS,
  selectMode: 'prop',
  tableId: 'catalog-link',
});
