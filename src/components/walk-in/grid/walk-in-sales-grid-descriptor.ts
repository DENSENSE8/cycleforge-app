/** Walk-in sales grid descriptor — TanStack defs for LedgerGridSurface. */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { SaleRow } from '@/lib/walk-in/transactions';
import {
  defaultDirForWalkInSalesColumn,
  isWalkInSalesColumnSortable,
  type WalkInSalesGridColumn,
} from './walk-in-sales-grid-layout';

export const WALKINSALES_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeWalkInSalesGridDescriptor(
  columns: readonly WalkInSalesGridColumn[],
): GridSurfaceDescriptor<SaleRow, WalkInSalesGridColumn> {
  return makeGridSurfaceDescriptor<SaleRow, WalkInSalesGridColumn>(
    'sales.walk-in',
    columns,
    {
      isSortable: (key) => isWalkInSalesColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForWalkInSalesColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    WALKINSALES_GRID_CAPABILITIES,
  );
}
