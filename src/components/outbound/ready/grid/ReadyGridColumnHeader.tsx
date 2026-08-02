'use client';

import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
import {
  READY_GRID_COLUMNS,
  READY_GRID_FROZEN_CELL,
  isReadyGridFrozen,
  isReadyGridSortable,
  readyGridCell,
  readyGridFrozenLeft,
  readyGridRowShellClass,
  readyGridTemplate,
  type ReadyGridColumn,
  type ReadyGridColumnKey,
  type ReadyGridSortDir,
} from './ready-grid-layout';

const READY_HEADER_LAYOUT: LedgerHeaderLayoutApi<ReadyGridColumn> = {
  template: readyGridTemplate,
  cellClass: readyGridCell,
  rowShellClass: readyGridRowShellClass,
  frozenCellClass: READY_GRID_FROZEN_CELL,
  frozenLeft: (key) => readyGridFrozenLeft(key as ReadyGridColumnKey),
  isFrozen: isReadyGridFrozen,
  isSortable: isReadyGridSortable,
};

/**
 * Sticky column header for the Ready LedgerGrid — thin adapter over
 * {@link LedgerGridColumnHeader}. Read-only browse (no select-all); the empty
 * `select` gutter keeps the frozen product cell aligned with every other house
 * grid. Columns arrive already visibility-resolved from `ReadyGridView`.
 */
export function ReadyGridColumnHeader({
  columns = READY_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
  onOpenColumnDetails,
  columnDetailsOpen = false,
}: {
  columns?: readonly ReadyGridColumn[];
  activeSort?: ReadyGridColumnKey | null;
  sortDir?: ReadyGridSortDir | null;
  onSortColumn?: (key: ReadyGridColumnKey) => void;
  onOpenColumnDetails?: () => void;
  columnDetailsOpen?: boolean;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={READY_HEADER_LAYOUT}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={onSortColumn ? (key) => onSortColumn(key as ReadyGridColumnKey) : undefined}
      onOpenColumnDetails={onOpenColumnDetails}
      columnDetailsOpen={columnDetailsOpen}
    />
  );
}
