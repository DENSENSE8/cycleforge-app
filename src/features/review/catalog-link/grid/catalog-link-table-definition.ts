/**
 * `review.catalog-link` — unmatched listings that need a catalog SKU.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import {
  CATALOG_LINK_GRID_CAPABILITIES,
  makeCatalogLinkGridDescriptor,
} from './catalog-link-grid-descriptor';
import {
  CATALOG_LINK_COMPOUND_COLUMNS,
  type CatalogLinkGridColumn,
} from './catalog-link-grid-layout';

export const CATALOG_LINK_TABLE_DEFINITION = parseTableDefinition({
  id: 'review.catalog-link',
  tableId: 'catalog-link',
  entityFamily: 'catalog-link',
  cellMapKey: 'catalog-link',
  ariaLabel: 'Listings that need a catalog match',
  testId: 'catalog-link-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: CATALOG_LINK_GRID_CAPABILITIES,
  columns: CATALOG_LINK_COMPOUND_COLUMNS,
});

export const CATALOG_LINK_TABLE_BINDING: TableSurfaceBinding<
  CatalogLinkChoreRow,
  CatalogLinkGridColumn
> = {
  definition: CATALOG_LINK_TABLE_DEFINITION,
  columns: CATALOG_LINK_COMPOUND_COLUMNS,
  makeDescriptor: makeCatalogLinkGridDescriptor,
  recordPlane: { kind: 'inspector', occupantId: 'detail:catalog-link' },
};
