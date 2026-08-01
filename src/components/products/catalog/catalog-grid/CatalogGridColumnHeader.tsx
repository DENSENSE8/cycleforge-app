'use client';

import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
import {
  CATALOG_GRID_COLUMNS,
  CATALOG_GRID_FROZEN_CELL,
  catalogGridCell,
  catalogGridFrozenLeft,
  catalogGridRowShellClass,
  catalogGridTemplate,
  isCatalogGridFrozen,
  isCatalogGridSortable,
  type CatalogGridColumn,
  type CatalogGridColumnKey,
  type CatalogGridSortDir,
} from '@/lib/products/catalog-grid-layout';

const CATALOG_HEADER_LAYOUT: LedgerHeaderLayoutApi<CatalogGridColumn> = {
  template: catalogGridTemplate,
  cellClass: catalogGridCell,
  rowShellClass: catalogGridRowShellClass,
  frozenCellClass: CATALOG_GRID_FROZEN_CELL,
  frozenLeft: catalogGridFrozenLeft,
  isFrozen: isCatalogGridFrozen,
  isSortable: isCatalogGridSortable,
};

/**
 * Sticky column header for the catalog LedgerGrid — thin adapter over
 * {@link LedgerGridColumnHeader}. Select-all is always on (catalog multi-select
 * is always-on, same as Repair). Columns arrive already visibility-resolved
 * from {@link CatalogGridView}.
 */
export function CatalogGridColumnHeader({
  selectionScope,
  className,
  columns = CATALOG_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
}: {
  selectionScope: string;
  className?: string;
  columns?: readonly CatalogGridColumn[];
  activeSort?: CatalogGridColumnKey | null;
  sortDir?: CatalogGridSortDir | null;
  onSortColumn?: (key: CatalogGridColumnKey) => void;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={CATALOG_HEADER_LAYOUT}
      selectMode
      selectionScope={selectionScope}
      className={className}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={
        onSortColumn
          ? (key) => onSortColumn(key as CatalogGridColumnKey)
          : undefined
      }
    />
  );
}
