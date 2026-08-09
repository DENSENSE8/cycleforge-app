'use client';

import { Calendar, Ticket } from '@/components/Icons';
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
 * Date / ticket glyphs stay family overrides; Price uses ColumnType `price` →
 * Receipt via the type→glyph SoT (no local money-mark fork).
 */
export const RepairGridColumnHeader = makeLedgerGridColumnHeader<
  RepairGridColumn,
  RepairGridColumnKey,
  'always'
>({
  layout: REPAIR_HEADER_LAYOUT,
  defaultColumns: REPAIR_GRID_COLUMNS,
  selectMode: 'always',
  tableId: 'repair',
  glyphFor: (column) =>
    column.key === 'date' ? (
      <Calendar className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : column.key === 'ticket' ? (
      <Ticket className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : undefined,
});
