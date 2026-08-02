'use client';

import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
import {
  BINS_GRID_COLUMNS,
  BINS_GRID_FROZEN_CELL,
  binsGridCell,
  binsGridFrozenLeft,
  binsGridRowShellClass,
  binsGridTemplate,
  isBinsGridFrozen,
  isBinsGridSortable,
  type BinsGridColumn,
  type BinsGridColumnKey,
  type BinsGridSortDir,
} from './bins-grid-layout';

const BINS_HEADER_LAYOUT: LedgerHeaderLayoutApi<BinsGridColumn> = {
  template: binsGridTemplate,
  cellClass: binsGridCell,
  rowShellClass: binsGridRowShellClass,
  frozenCellClass: BINS_GRID_FROZEN_CELL,
  frozenLeft: (key) => binsGridFrozenLeft(key as BinsGridColumnKey),
  isFrozen: isBinsGridFrozen,
  isSortable: isBinsGridSortable,
  // Identity track is `barcode`, not the house-default `title`.
  frozenEdgeKey: 'barcode',
};

/**
 * Sticky column header for the bins LedgerGrid — thin adapter over
 * {@link LedgerGridColumnHeader}. Select-all is always on (bins multi-select is
 * parent-controlled via the selection bus). Columns arrive already
 * visibility-resolved from {@link BinsGridView}.
 */
export function BinsGridColumnHeader({
  selectionScope,
  columns = BINS_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
  onOpenColumnDetails,
  columnDetailsOpen = false,
}: {
  selectionScope: string;
  columns?: readonly BinsGridColumn[];
  activeSort?: BinsGridColumnKey | null;
  sortDir?: BinsGridSortDir | null;
  onSortColumn?: (key: BinsGridColumnKey) => void;
  onOpenColumnDetails?: () => void;
  columnDetailsOpen?: boolean;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={BINS_HEADER_LAYOUT}
      selectMode
      selectionScope={selectionScope}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={onSortColumn ? (key) => onSortColumn(key as BinsGridColumnKey) : undefined}
      onOpenColumnDetails={onOpenColumnDetails}
      columnDetailsOpen={columnDetailsOpen}
    />
  );
}
