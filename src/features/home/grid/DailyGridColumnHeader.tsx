'use client';

import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  DAILY_GRID_COLUMNS,
  DAILY_GRID_FROZEN_CELL,
  dailyGridCell,
  dailyGridFrozenLeft,
  dailyGridRowShellClass,
  dailyGridTemplate,
  isDailyGridFrozen,
  isDailyGridSortable,
  type DailyGridColumn,
  type DailyGridColumnKey,
} from '@/lib/daily-checks/daily-grid-layout';

const DAILY_HEADER_LAYOUT: LedgerHeaderLayoutApi<DailyGridColumn> = {
  template: dailyGridTemplate,
  cellClass: dailyGridCell,
  rowShellClass: dailyGridRowShellClass,
  frozenCellClass: DAILY_GRID_FROZEN_CELL,
  frozenLeft: dailyGridFrozenLeft,
  isFrozen: isDailyGridFrozen,
  isSortable: isDailyGridSortable,
};

/**
 * Sticky column header for the Daily task grid. No glyph overrides exist to
 * pass — headers are sentence-case text, and the type glyph appears only when a
 * track is too narrow for its word (`gridHeaderShowsLabel` decides).
 */
export const DailyGridColumnHeader = makeLedgerGridColumnHeader<
  DailyGridColumn,
  DailyGridColumnKey,
  'prop'
>({
  layout: DAILY_HEADER_LAYOUT,
  defaultColumns: DAILY_GRID_COLUMNS,
  selectMode: 'prop',
  tableId: 'daily',
});
