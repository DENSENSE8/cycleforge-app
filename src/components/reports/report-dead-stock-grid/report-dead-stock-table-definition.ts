/** `reports.dead-stock` — the table definition, capabilities and surface descriptor for the dead-stock (90d+) report. */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { DeadStockReportRow } from '@/lib/reports/report-rows';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  REPORT_DEAD_STOCK_COMPOUND_COLUMNS,
  defaultDirForReportDeadStockColumn,
  isReportDeadStockColumnSortable,
  type ReportDeadStockGridColumn,
} from './report-dead-stock-grid-layout';

/** Nothing on this desk writes. */
export const REPORT_DEAD_STOCK_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeReportDeadStockGridDescriptor(
  columns: readonly ReportDeadStockGridColumn[],
): GridSurfaceDescriptor<DeadStockReportRow, ReportDeadStockGridColumn> {
  return makeGridSurfaceDescriptor<DeadStockReportRow, ReportDeadStockGridColumn>(
    'reports.dead-stock',
    columns,
    {
      isSortable: (key) => isReportDeadStockColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForReportDeadStockColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    REPORT_DEAD_STOCK_GRID_CAPABILITIES,
  );
}

export const REPORT_DEAD_STOCK_TABLE_DEFINITION = parseTableDefinition({
  id: 'reports.dead-stock',
  tableId: 'report-dead-stock',
  entityFamily: 'report-dead-stock',
  cellMapKey: 'report-dead-stock',
  ariaLabel: 'Dead stock, dormant 90 days or more',
  testId: 'report-dead-stock-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: REPORT_DEAD_STOCK_GRID_CAPABILITIES,
  columns: REPORT_DEAD_STOCK_COMPOUND_COLUMNS,
});

export const REPORT_DEAD_STOCK_TABLE_BINDING: TableSurfaceBinding<
  DeadStockReportRow,
  ReportDeadStockGridColumn
> = {
  definition: REPORT_DEAD_STOCK_TABLE_DEFINITION,
  columns: REPORT_DEAD_STOCK_COMPOUND_COLUMNS,
  makeDescriptor: makeReportDeadStockGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'Honest absence. A dead-stock row is a projection of sku_stock joined to the ledger — there is no record behind it to open, and the SKU itself already has a page (/inventory/health/sku/[sku]), which the row title links to. A record plane here would either duplicate that page or invent an editor over a report.',
  },
};
