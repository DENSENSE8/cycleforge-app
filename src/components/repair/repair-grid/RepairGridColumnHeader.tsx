'use client';

import { Calendar, DollarSign, Ticket } from '@/components/Icons';
import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid/LedgerGridColumnHeader';
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
  type RepairGridSortDir,
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
 * Sticky column header for the repair queue LedgerGrid — thin adapter over
 * {@link LedgerGridColumnHeader}. Select-all is always on (repair multi-select
 * is always-on). Columns arrive already visibility-resolved from
 * {@link RepairGridView}.
 */
export function RepairGridColumnHeader({
  selectionScope,
  className,
  columns = REPAIR_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
  onOpenColumnDetails,
  columnDetailsOpen = false,
}: {
  selectionScope: string;
  className?: string;
  columns?: readonly RepairGridColumn[];
  activeSort?: RepairGridColumnKey | null;
  sortDir?: RepairGridSortDir | null;
  onSortColumn?: (key: RepairGridColumnKey) => void;
  onOpenColumnDetails?: () => void;
  columnDetailsOpen?: boolean;
}) {
  return (
    <LedgerGridColumnHeader
      columns={columns}
      layout={REPAIR_HEADER_LAYOUT}
      selectMode
      selectionScope={selectionScope}
      className={className}
      activeSort={activeSort}
      sortDir={sortDir}
      onSortColumn={
        onSortColumn
          ? (key) => onSortColumn(key as RepairGridColumnKey)
          : undefined
      }
      onOpenColumnDetails={onOpenColumnDetails}
      columnDetailsOpen={columnDetailsOpen}
      glyphFor={(column) =>
        column.key === 'date' ? (
          <Calendar className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
        ) : column.key === 'price' ? (
          <DollarSign className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
        ) : column.key === 'ticket' ? (
          <Ticket className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
        ) : undefined
      }
    />
  );
}
