'use client';

import { Clock } from '@/components/Icons';
import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
import {
  RECEIVING_GRID_COLUMNS,
  RECEIVING_GRID_FROZEN_CELL,
  receivingGridCell,
  receivingGridFrozenLeft,
  receivingGridRowShellClass,
  receivingGridTemplate,
  isReceivingGridFrozen,
  isReceivingGridSortable,
  type ReceivingGridColumn,
  type ReceivingGridColumnKey,
  type ReceivingGridSortDir,
} from '@/lib/receiving/receiving-grid-layout';

const RECEIVING_HEADER_LAYOUT: LedgerHeaderLayoutApi<ReceivingGridColumn> = {
  template: receivingGridTemplate,
  cellClass: receivingGridCell,
  rowShellClass: receivingGridRowShellClass,
  frozenCellClass: RECEIVING_GRID_FROZEN_CELL,
  frozenLeft: receivingGridFrozenLeft,
  isFrozen: isReceivingGridFrozen,
  isSortable: isReceivingGridSortable,
};

/**
 * Sticky column header for Unbox / History / Testing LedgerGrid — thin adapter
 * over {@link LedgerGridColumnHeader}. Columns arrive already visibility-resolved
 * from `ReceivingGridView` / `useGridColumnVisibility`.
 */
export function ReceivingGridColumnHeader({
  isMobile = false,
  selectMode = false,
  selectionScope,
  className,
  columns = RECEIVING_GRID_COLUMNS,
  /** Overrides the `stage` column header label (Unboxed / Scanned / Tested). */
  stageLabel = 'Stage',
  activeSort = null,
  sortDir = null,
  onSortColumn,
  onOpenColumnDetails,
  columnDetailsOpen = false,
}: {
  isMobile?: boolean;
  selectMode?: boolean;
  selectionScope?: string;
  className?: string;
  columns?: readonly ReceivingGridColumn[];
  stageLabel?: string;
  activeSort?: ReceivingGridColumnKey | null;
  sortDir?: ReceivingGridSortDir | null;
  onSortColumn?: (key: ReceivingGridColumnKey) => void;
  onOpenColumnDetails?: () => void;
  columnDetailsOpen?: boolean;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={RECEIVING_HEADER_LAYOUT}
      isMobile={isMobile}
      selectMode={selectMode}
      selectionScope={selectionScope}
      className={className}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={
        onSortColumn
          ? (key) => onSortColumn(key as ReceivingGridColumnKey)
          : undefined
      }
      onOpenColumnDetails={onOpenColumnDetails}
      columnDetailsOpen={columnDetailsOpen}
      labelFor={(column) => (column.key === 'stage' ? stageLabel : undefined)}
      glyphFor={(column) =>
        column.key === 'stage' ? (
          <Clock className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
        ) : undefined
      }
    />
  );
}
