/**
 * `products.catalog` — Catalog table definition (plan Phase 1, wave 3).
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference;
 * the shell recipe, aria name, testid and prefs bucket are the literals the
 * mount used to carry.
 */

import type { CatalogListRow } from '@/components/products/catalog/types';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { CATALOG_GRID_COLUMNS, type CatalogGridColumn } from '@/lib/products/catalog-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { CATALOG_GRID_CAPABILITIES, makeCatalogGridDescriptor } from './catalog-grid-descriptor';

export const CATALOG_TABLE_DEFINITION = parseTableDefinition({
  id: 'products.catalog',
  tableId: 'catalog',
  entityFamily: 'catalog',
  cellMapKey: 'catalog',
  ariaLabel: 'Product catalog',
  testId: 'catalog-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: CATALOG_GRID_CAPABILITIES,
  columns: CATALOG_GRID_COLUMNS,
});

export const CATALOG_TABLE_BINDING: TableSurfaceBinding<CatalogListRow, CatalogGridColumn> = {
  definition: CATALOG_TABLE_DEFINITION,
  columns: CATALOG_GRID_COLUMNS,
  makeDescriptor: makeCatalogGridDescriptor,
  // A catalog row IS a product page. Opening it navigates to
  // `productDetailHref(sku)` rather than peeking, because the product record is
  // far larger than a panel and has its own route, tabs and history.
  recordPlane: {
    kind: 'navigate',
    reason:
      'A SKU has its own route with tabs and history — far more than a peek panel holds.',
  },
};
