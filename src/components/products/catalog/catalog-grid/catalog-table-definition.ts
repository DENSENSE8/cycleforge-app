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
  // Ruled honest-absence — `NO_DESK_PEEK_SURFACES` in band3-find-only.guard.
  recordPlane: {
    kind: 'navigate',
    reason: 'catalog browse — rows navigate to the SKU page (productDetailHref)',
  },
};
