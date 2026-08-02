'use client';

import { Calendar, DollarSign, Ticket } from '@/components/Icons';
import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  REPAIR_GRID_COLUMNS,
  REPAIR_GRID_FROZEN_CELL,
  isRepairGridFrozen,
  isRepairGridSortable,
  repairGridCell,
  repairGridFrozenLeft,
  repairGridRowShellClass,
  repairGridTemplate,
  type RepairGridColumn,
  type RepairGridColumnKey,
} from '@/lib/repair/repair-grid-layout';

const REPAIR_HEADER_LAYOUT: LedgerHeaderLayoutApi<RepairGridColumn> = {
  template: repairGridTemplate,
  cellClass: repairGridCell,
  rowShellClass: repairGridRowShellClass,
  frozenCellClass: REPAIR_GRID_FROZEN_CELL,
  frozenLeft: repairGridFrozenLeft,
  isFrozen: isRepairGridFrozen,
  isSortable: isRepairGridSortable,
};

/**
 * Sticky column header for the repair queue LedgerGrid. Repair multi-select is
 * always-on, so `selectMode: 'always'` makes `selectionScope` a REQUIRED prop.
 *
 * The date / price / ticket glyphs are a FAMILY-wide override, so they live in
 * the factory config rather than at each mount — a repair `price` column means
 * the same thing wherever it renders.
 */
export const RepairGridColumnHeader = makeLedgerGridColumnHeader<
  RepairGridColumn,
  RepairGridColumnKey,
  'always'
>({
  layout: REPAIR_HEADER_LAYOUT,
  defaultColumns: REPAIR_GRID_COLUMNS,
  selectMode: 'always',
  glyphFor: (column) =>
    column.key === 'date' ? (
      <Calendar className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : column.key === 'price' ? (
      <DollarSign className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : column.key === 'ticket' ? (
      <Ticket className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : undefined,
});
