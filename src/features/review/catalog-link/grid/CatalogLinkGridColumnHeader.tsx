'use client';

/**
 * Sticky column headers for the two Review · Catalog link grids — thin adapters
 * over {@link LedgerGridColumnHeader}, one per column model.
 *
 * Read-only browse (no select-all); the empty `select` gutter keeps the frozen
 * listing cell aligned with every other house grid. Columns arrive already
 * visibility-resolved from {@link ReviewCatalogLinkGridView}, so the header, the
 * rows and the CSS template all consume the same list.
 */

import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
import {
  CATALOG_LINK_GRID_COLUMNS,
  CATALOG_LINK_GRID_FROZEN_CELL,
  catalogLinkGridCell,
  catalogLinkGridFrozenLeft,
  catalogLinkGridRowShellClass,
  catalogLinkGridTemplate,
  isCatalogLinkGridFrozen,
  isCatalogLinkGridSortable,
  type CatalogLinkGridColumn,
  type CatalogLinkGridColumnKey,
  type CatalogLinkGridSortDir,
} from './catalog-link-grid-layout';
import {
  IMPORT_EXCEPTION_GRID_COLUMNS,
  IMPORT_EXCEPTION_GRID_FROZEN_CELL,
  importExceptionGridCell,
  importExceptionGridFrozenLeft,
  importExceptionGridRowShellClass,
  importExceptionGridTemplate,
  isImportExceptionGridFrozen,
  isImportExceptionGridSortable,
  type ImportExceptionGridColumn,
  type ImportExceptionGridColumnKey,
  type ImportExceptionGridSortDir,
} from './import-exception-grid-layout';

const CATALOG_LINK_HEADER_LAYOUT: LedgerHeaderLayoutApi<CatalogLinkGridColumn> = {
  template: catalogLinkGridTemplate,
  cellClass: catalogLinkGridCell,
  rowShellClass: catalogLinkGridRowShellClass,
  frozenCellClass: CATALOG_LINK_GRID_FROZEN_CELL,
  frozenLeft: (key) => catalogLinkGridFrozenLeft(key as CatalogLinkGridColumnKey),
  isFrozen: isCatalogLinkGridFrozen,
  isSortable: isCatalogLinkGridSortable,
};

const IMPORT_EXCEPTION_HEADER_LAYOUT: LedgerHeaderLayoutApi<ImportExceptionGridColumn> = {
  template: importExceptionGridTemplate,
  cellClass: importExceptionGridCell,
  rowShellClass: importExceptionGridRowShellClass,
  frozenCellClass: IMPORT_EXCEPTION_GRID_FROZEN_CELL,
  frozenLeft: (key) => importExceptionGridFrozenLeft(key as ImportExceptionGridColumnKey),
  isFrozen: isImportExceptionGridFrozen,
  isSortable: isImportExceptionGridSortable,
};

export function CatalogLinkGridColumnHeader({
  columns = CATALOG_LINK_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
  onOpenColumnDetails,
  columnDetailsOpen = false,
}: {
  columns?: readonly CatalogLinkGridColumn[];
  activeSort?: CatalogLinkGridColumnKey | null;
  sortDir?: CatalogLinkGridSortDir | null;
  onSortColumn?: (key: CatalogLinkGridColumnKey) => void;
  onOpenColumnDetails?: () => void;
  columnDetailsOpen?: boolean;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={CATALOG_LINK_HEADER_LAYOUT}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={onSortColumn ? (key) => onSortColumn(key as CatalogLinkGridColumnKey) : undefined}
      onOpenColumnDetails={onOpenColumnDetails}
      columnDetailsOpen={columnDetailsOpen}
    />
  );
}

export function ImportExceptionGridColumnHeader({
  columns = IMPORT_EXCEPTION_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
  onOpenColumnDetails,
  columnDetailsOpen = false,
}: {
  columns?: readonly ImportExceptionGridColumn[];
  activeSort?: ImportExceptionGridColumnKey | null;
  sortDir?: ImportExceptionGridSortDir | null;
  onSortColumn?: (key: ImportExceptionGridColumnKey) => void;
  onOpenColumnDetails?: () => void;
  columnDetailsOpen?: boolean;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={IMPORT_EXCEPTION_HEADER_LAYOUT}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={
        onSortColumn ? (key) => onSortColumn(key as ImportExceptionGridColumnKey) : undefined
      }
      onOpenColumnDetails={onOpenColumnDetails}
      columnDetailsOpen={columnDetailsOpen}
    />
  );
}
