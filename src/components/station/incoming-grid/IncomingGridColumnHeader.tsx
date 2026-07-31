'use client';

import { Calendar, Clock } from '@/components/Icons';
import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
import {
  INCOMING_GRID_COLUMNS,
  INCOMING_GRID_FROZEN_CELL,
  incomingGridCell,
  incomingGridFrozenLeft,
  incomingGridRowShellClass,
  incomingGridTemplate,
  isIncomingGridFrozen,
  isIncomingGridSortable,
  type IncomingGridColumn,
  type IncomingGridColumnKey,
  type IncomingGridSortDir,
} from '@/lib/receiving/incoming-grid-layout';

const INCOMING_HEADER_LAYOUT: LedgerHeaderLayoutApi<IncomingGridColumn> = {
  template: incomingGridTemplate,
  cellClass: incomingGridCell,
  rowShellClass: incomingGridRowShellClass,
  frozenCellClass: INCOMING_GRID_FROZEN_CELL,
  frozenLeft: incomingGridFrozenLeft,
  isFrozen: isIncomingGridFrozen,
  isSortable: isIncomingGridSortable,
};

/**
 * Sticky column header for the Incoming LedgerGrid — thin adapter over
 * {@link LedgerGridColumnHeader}. Columns arrive already visibility-resolved
 * from `IncomingGridView` / `useGridColumnVisibility`.
 */
export function IncomingGridColumnHeader({
  isMobile = false,
  selectMode = false,
  selectionScope,
  className,
  columns = INCOMING_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
}: {
  isMobile?: boolean;
  selectMode?: boolean;
  selectionScope?: string;
  className?: string;
  columns?: readonly IncomingGridColumn[];
  activeSort?: IncomingGridColumnKey | null;
  sortDir?: IncomingGridSortDir | null;
  onSortColumn?: (key: IncomingGridColumnKey) => void;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={INCOMING_HEADER_LAYOUT}
      isMobile={isMobile}
      selectMode={selectMode}
      selectionScope={selectionScope}
      className={className}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={
        onSortColumn
          ? (key) => onSortColumn(key as IncomingGridColumnKey)
          : undefined
      }
      glyphFor={(column) =>
        column.key === 'date' ? (
          <Calendar className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
        ) : column.key === 'age' ? (
          <Clock className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
        ) : undefined
      }
    />
  );
}
