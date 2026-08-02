'use client';

import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
import {
  UNFOUND_GRID_COLUMNS,
  UNFOUND_GRID_FROZEN_CELL,
  isUnfoundGridFrozen,
  isUnfoundGridSortable,
  unfoundGridCell,
  unfoundGridFrozenLeft,
  unfoundGridRowShellClass,
  unfoundGridTemplate,
  type UnfoundGridColumn,
  type UnfoundGridColumnKey,
  type UnfoundGridSortDir,
} from './unfound-grid-layout';

const UNFOUND_HEADER_LAYOUT: LedgerHeaderLayoutApi<UnfoundGridColumn> = {
  template: unfoundGridTemplate,
  cellClass: unfoundGridCell,
  rowShellClass: unfoundGridRowShellClass,
  frozenCellClass: UNFOUND_GRID_FROZEN_CELL,
  frozenLeft: (key) => unfoundGridFrozenLeft(key as UnfoundGridColumnKey),
  isFrozen: isUnfoundGridFrozen,
  isSortable: isUnfoundGridSortable,
};

/**
 * Sticky column header for the Unfound LedgerGrid — thin adapter over
 * {@link LedgerGridColumnHeader}. No select-all (`multiSelect: false`); the
 * empty `select` gutter keeps the frozen product cell aligned with every other
 * house grid. Columns arrive already visibility-resolved from `UnfoundGridView`.
 */
export function UnfoundGridColumnHeader({
  columns = UNFOUND_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
  onOpenColumnDetails,
  columnDetailsOpen = false,
}: {
  columns?: readonly UnfoundGridColumn[];
  activeSort?: UnfoundGridColumnKey | null;
  sortDir?: UnfoundGridSortDir | null;
  onSortColumn?: (key: UnfoundGridColumnKey) => void;
  onOpenColumnDetails?: () => void;
  columnDetailsOpen?: boolean;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={UNFOUND_HEADER_LAYOUT}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={onSortColumn ? (key) => onSortColumn(key as UnfoundGridColumnKey) : undefined}
      onOpenColumnDetails={onOpenColumnDetails}
      columnDetailsOpen={columnDetailsOpen}
    />
  );
}
