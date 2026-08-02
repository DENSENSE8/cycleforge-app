'use client';

import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
import {
  MY_DAY_GRID_COLUMNS,
  MY_DAY_GRID_FROZEN_CELL,
  isMyDayGridFrozen,
  isMyDayGridSortable,
  myDayGridCell,
  myDayGridFrozenLeft,
  myDayGridRowShellClass,
  myDayGridTemplate,
  type MyDayGridColumn,
  type MyDayGridColumnKey,
  type MyDayGridSortDir,
} from '@/lib/my-day/my-day-grid-layout';

const MY_DAY_HEADER_LAYOUT: LedgerHeaderLayoutApi<MyDayGridColumn> = {
  template: myDayGridTemplate,
  cellClass: myDayGridCell,
  rowShellClass: myDayGridRowShellClass,
  frozenCellClass: MY_DAY_GRID_FROZEN_CELL,
  frozenLeft: (key) => myDayGridFrozenLeft(key as MyDayGridColumnKey),
  isFrozen: isMyDayGridFrozen,
  isSortable: isMyDayGridSortable,
};

/**
 * Sticky column header for the Today LedgerGrid — a thin adapter over
 * {@link LedgerGridColumnHeader} (the sticky-header SoT), exactly like the
 * Pickup / Receiving / Incoming adapters. No select-all: Today declares
 * `multiSelect: false`, so the gutter is a spacer.
 */
export function MyDayGridColumnHeader({
  columns = MY_DAY_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
}: {
  columns?: readonly MyDayGridColumn[];
  activeSort?: MyDayGridColumnKey | null;
  sortDir?: MyDayGridSortDir | null;
  onSortColumn?: (key: MyDayGridColumnKey) => void;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={MY_DAY_HEADER_LAYOUT}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={onSortColumn ? (key) => onSortColumn(key as MyDayGridColumnKey) : undefined}
    />
  );
}
