'use client';

import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  TECH_ALL_GRID_COLUMNS,
  isTechAllGridSortable,
  type TechAllGridColumn,
  type TechAllGridColumnKey,
} from '@/lib/tech/tech-all-grid-layout';

/**
 * The per-family layout fields this carried were aliases of the same shared
 * functions; `LedgerHeaderLayoutApi` collapsed them. What stays per family is
 * which columns sort and where the frozen edge sits.
 */
const TECH_ALL_HEADER_LAYOUT: LedgerHeaderLayoutApi = {
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
