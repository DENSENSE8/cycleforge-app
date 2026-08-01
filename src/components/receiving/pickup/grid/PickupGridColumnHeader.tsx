'use client';

import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
import {
  PICKUP_GRID_COLUMNS,
  PICKUP_GRID_FROZEN_CELL,
  isPickupGridFrozen,
  isPickupGridSortable,
  pickupGridCell,
  pickupGridFrozenLeft,
  pickupGridRowShellClass,
  pickupGridTemplate,
  type PickupGridColumn,
  type PickupGridColumnKey,
  type PickupGridSortDir,
} from './pickup-grid-layout';

const PICKUP_HEADER_LAYOUT: LedgerHeaderLayoutApi<PickupGridColumn> = {
  template: pickupGridTemplate,
  cellClass: pickupGridCell,
  rowShellClass: pickupGridRowShellClass,
  frozenCellClass: PICKUP_GRID_FROZEN_CELL,
  frozenLeft: (key) => pickupGridFrozenLeft(key as PickupGridColumnKey),
  isFrozen: isPickupGridFrozen,
  isSortable: isPickupGridSortable,
};

/**
 * Sticky column header for the Local Pickup LedgerGrid — thin adapter over
 * {@link LedgerGridColumnHeader}. Read-only browse (no select-all); the empty
 * `select` gutter keeps the frozen title aligned with every other station grid.
 * Columns arrive already visibility-resolved from {@link PickupGridView}.
 */
export function PickupGridColumnHeader({
  columns = PICKUP_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
}: {
  columns?: readonly PickupGridColumn[];
  activeSort?: PickupGridColumnKey | null;
  sortDir?: PickupGridSortDir | null;
  onSortColumn?: (key: PickupGridColumnKey) => void;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={PICKUP_HEADER_LAYOUT}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={
        onSortColumn
          ? (key) => onSortColumn(key as PickupGridColumnKey)
          : undefined
      }
    />
  );
}
