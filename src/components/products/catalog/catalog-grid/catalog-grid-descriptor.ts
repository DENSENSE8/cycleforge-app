/**
 * Catalog grid surface descriptor — lifts {@link CATALOG_GRID_COLUMNS} into
 * the TanStack defs `LedgerGridSurface` mounts.
 */

import { makeGridSurfaceDescriptor, type GridSurfaceDescriptor } from '@/design-system/components/grid';
import type { CatalogListRow } from '@/components/products/catalog/types';
import {
  CATALOG_GRID_COLUMNS,
  catalogContentMinWidthRem,
  defaultDirForCatalogGridSort,
  isCatalogGridFrozen,
  isCatalogGridSortable,
  type CatalogGridColumn,
} from '@/lib/products/catalog-grid-layout';

export const CATALOG_GRID_DESCRIPTOR: GridSurfaceDescriptor<CatalogListRow, CatalogGridColumn> =
  makeGridSurfaceDescriptor<CatalogListRow, CatalogGridColumn>(
    'products.catalog',
    CATALOG_GRID_COLUMNS,
    catalogContentMinWidthRem(CATALOG_GRID_COLUMNS),
    {
      isSortable: isCatalogGridSortable,
      sortDescFirst: (key) => defaultDirForCatalogGridSort(key) === 'desc',
      isLocked: isCatalogGridFrozen,
    },
  );
