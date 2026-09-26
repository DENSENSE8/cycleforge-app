/**
 * Catalog grid surface descriptor — lifts {@link CATALOG_GRID_COLUMNS} into
 * the TanStack defs `LedgerGridSurface` mounts.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { CatalogListRow } from '@/components/products/catalog/types';
import {
  defaultDirForCatalogColumn,
  isCatalogColumnSortable,
  type CatalogGridColumn,
} from '@/lib/products/catalog-grid-layout';

/** Product catalog — display + multi-select; never staff triage row wash. */
export const CATALOG_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render — a hidden column loses its width, not just its content.
 */
export function makeCatalogGridDescriptor(
  columns: readonly CatalogGridColumn[],
): GridSurfaceDescriptor<CatalogListRow, CatalogGridColumn> {
  return makeGridSurfaceDescriptor<CatalogListRow, CatalogGridColumn>(
    'products.catalog',
    columns,
    {
      isSortable: (key) => isCatalogColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForCatalogColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`select · title`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    CATALOG_GRID_CAPABILITIES,
  );
}

// No pre-built canonical descriptor:
