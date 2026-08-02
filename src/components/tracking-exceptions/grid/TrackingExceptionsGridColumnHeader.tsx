'use client';

import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
import {
  TRACKING_EXCEPTIONS_GRID_COLUMNS,
  TRACKING_EXCEPTIONS_GRID_FROZEN_CELL,
  isTrackingExceptionsGridFrozen,
  isTrackingExceptionsGridSortable,
  trackingExceptionsGridCell,
  trackingExceptionsGridFrozenLeft,
  trackingExceptionsGridRowShellClass,
  trackingExceptionsGridTemplate,
  type TrackingExceptionsGridColumn,
  type TrackingExceptionsGridColumnKey,
  type TrackingExceptionsGridSortDir,
} from './tracking-exceptions-grid-layout';

const TRACKING_EXCEPTIONS_HEADER_LAYOUT: LedgerHeaderLayoutApi<TrackingExceptionsGridColumn> = {
  template: trackingExceptionsGridTemplate,
  cellClass: trackingExceptionsGridCell,
  rowShellClass: trackingExceptionsGridRowShellClass,
  frozenCellClass: TRACKING_EXCEPTIONS_GRID_FROZEN_CELL,
  frozenLeft: (key) => trackingExceptionsGridFrozenLeft(key as TrackingExceptionsGridColumnKey),
  isFrozen: isTrackingExceptionsGridFrozen,
  isSortable: isTrackingExceptionsGridSortable,
};

/**
 * Sticky column header for the Tracking Exceptions LedgerGrid — thin adapter
 * over {@link LedgerGridColumnHeader}. Read-only browse (no select-all); the
 * empty `select` gutter keeps the frozen tracking cell aligned with every
 * other house grid.
 */
export function TrackingExceptionsGridColumnHeader({
  columns = TRACKING_EXCEPTIONS_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
  onOpenColumnDetails,
  columnDetailsOpen = false,
}: {
  columns?: readonly TrackingExceptionsGridColumn[];
  activeSort?: TrackingExceptionsGridColumnKey | null;
  sortDir?: TrackingExceptionsGridSortDir | null;
  onSortColumn?: (key: TrackingExceptionsGridColumnKey) => void;
  onOpenColumnDetails?: () => void;
  columnDetailsOpen?: boolean;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={TRACKING_EXCEPTIONS_HEADER_LAYOUT}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={
        onSortColumn
          ? (key) => onSortColumn(key as TrackingExceptionsGridColumnKey)
          : undefined
      }
      onOpenColumnDetails={onOpenColumnDetails}
      columnDetailsOpen={columnDetailsOpen}
    />
  );
}
