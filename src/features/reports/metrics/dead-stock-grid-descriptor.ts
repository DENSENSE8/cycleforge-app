import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import {
  DEAD_STOCK_COMPOUND_COLUMNS,
  deadStockSortFactFor,
  defaultDirForDeadStockGridSort,
  type DeadStockGridColumn,
} from '@/lib/reports/dead-stock-grid-layout';
import type { DeadStockRow } from '@/features/reports/metrics/report-rows';

export const DEAD_STOCK_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeDeadStockGridDescriptor(
  visible: readonly DeadStockGridColumn[],
): GridSurfaceDescriptor<DeadStockRow, DeadStockGridColumn> {
  return makeGridSurfaceDescriptor<DeadStockRow, DeadStockGridColumn>(
    'reports.dead-stock',
    visible,
    {
      isSortable: (key) => {
        const col = visible.find((c) => c.key === key);
        return col ? deadStockSortFactFor(col) != null : false;
      },
      sortDescFirst: (key) => {
        const col = visible.find((c) => c.key === key);
        const fact = col ? deadStockSortFactFor(col) : null;
        return fact ? defaultDirForDeadStockGridSort(fact) === 'desc' : false;
      },
    },
    DEAD_STOCK_GRID_CAPABILITIES,
  );
}

export { DEAD_STOCK_COMPOUND_COLUMNS };
