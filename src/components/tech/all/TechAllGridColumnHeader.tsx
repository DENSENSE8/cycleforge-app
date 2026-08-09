'use client';

import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  TECH_ALL_GRID_COLUMNS,
  TECH_ALL_GRID_FROZEN_CELL,
  isTechAllGridFrozen,
  isTechAllGridSortable,
  techAllGridCell,
  techAllGridFrozenLeft,
  techAllGridRowShellClass,
  techAllGridTemplate,
  type TechAllGridColumn,
  type TechAllGridColumnKey,
} from '@/lib/tech/tech-all-grid-layout';

const TECH_ALL_HEADER_LAYOUT: LedgerHeaderLayoutApi<TechAllGridColumn> = {
  template: techAllGridTemplate,
  cellClass: techAllGridCell,
  rowShellClass: techAllGridRowShellClass,
  frozenCellClass: TECH_ALL_GRID_FROZEN_CELL,
  frozenLeft: (key) => techAllGridFrozenLeft(key as TechAllGridColumnKey),
  isFrozen: isTechAllGridFrozen,
  isSortable: isTechAllGridSortable,
};

export const TechAllGridColumnHeader = makeLedgerGridColumnHeader<
  TechAllGridColumn,
  TechAllGridColumnKey
>({
  layout: TECH_ALL_HEADER_LAYOUT,
  defaultColumns: TECH_ALL_GRID_COLUMNS,
  tableId: 'tech-all',
});
