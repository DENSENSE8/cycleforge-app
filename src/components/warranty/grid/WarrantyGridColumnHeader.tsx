'use client';

import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
import {
  WARRANTY_GRID_COLUMNS,
  WARRANTY_GRID_FROZEN_CELL,
  isWarrantyGridFrozen,
  isWarrantyGridSortable,
  warrantyGridCell,
  warrantyGridFrozenLeft,
  warrantyGridRowShellClass,
  warrantyGridTemplate,
  type WarrantyGridColumn,
  type WarrantyGridColumnKey,
  type WarrantyGridSortDir,
} from './warranty-grid-layout';

const WARRANTY_HEADER_LAYOUT: LedgerHeaderLayoutApi<WarrantyGridColumn> = {
  template: warrantyGridTemplate,
  cellClass: warrantyGridCell,
  rowShellClass: warrantyGridRowShellClass,
  frozenCellClass: WARRANTY_GRID_FROZEN_CELL,
  frozenLeft: (key) => warrantyGridFrozenLeft(key as WarrantyGridColumnKey),
  isFrozen: isWarrantyGridFrozen,
  isSortable: isWarrantyGridSortable,
};

/**
 * Sticky column header for the warranty LedgerGrid — thin adapter over
 * {@link LedgerGridColumnHeader}. Read-only browse (no select-all); the empty
 * `select` gutter keeps the frozen item cell aligned with every other house
 * grid. Columns arrive already visibility-resolved from {@link WarrantyGridView}.
 */
export function WarrantyGridColumnHeader({
  columns = WARRANTY_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
  onOpenColumnDetails,
  columnDetailsOpen = false,
}: {
  columns?: readonly WarrantyGridColumn[];
  activeSort?: WarrantyGridColumnKey | null;
  sortDir?: WarrantyGridSortDir | null;
  onSortColumn?: (key: WarrantyGridColumnKey) => void;
  onOpenColumnDetails?: () => void;
  columnDetailsOpen?: boolean;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={WARRANTY_HEADER_LAYOUT}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={
        onSortColumn ? (key) => onSortColumn(key as WarrantyGridColumnKey) : undefined
      }
      onOpenColumnDetails={onOpenColumnDetails}
      columnDetailsOpen={columnDetailsOpen}
    />
  );
}
