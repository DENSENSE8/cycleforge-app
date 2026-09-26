/** `reports.velocity` — the table definition, capabilities and surface descriptor for the 30-day SKU-velocity report. */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { VelocityReportRow } from '@/lib/reports/report-rows';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  REPORT_VELOCITY_COMPOUND_COLUMNS,
  defaultDirForReportVelocityColumn,
  isReportVelocityColumnSortable,
  type ReportVelocityGridColumn,
} from './report-velocity-grid-layout';

/** Nothing on this desk writes. */
export const REPORT_VELOCITY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

function makeReportVelocityGridDescriptor(
  columns: readonly ReportVelocityGridColumn[],
): GridSurfaceDescriptor<VelocityReportRow, ReportVelocityGridColumn> {
  return makeGridSurfaceDescriptor<VelocityReportRow, ReportVelocityGridColumn>(
    'reports.velocity',
    columns,
    {
      isSortable: (key) => isReportVelocityColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForReportVelocityColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    REPORT_VELOCITY_GRID_CAPABILITIES,
  );
}

const REPORT_VELOCITY_TABLE_DEFINITION = parseTableDefinition({
  id: 'reports.velocity',
  tableId: 'report-velocity',
  entityFamily: 'report-velocity',
  cellMapKey: 'report-velocity',
  ariaLabel: 'SKU velocity, last 30 days',
  testId: 'report-velocity-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: REPORT_VELOCITY_GRID_CAPABILITIES,
  columns: REPORT_VELOCITY_COMPOUND_COLUMNS,
});

export const REPORT_VELOCITY_TABLE_BINDING: TableSurfaceBinding<
  VelocityReportRow,
  ReportVelocityGridColumn
> = {
  definition: REPORT_VELOCITY_TABLE_DEFINITION,
  columns: REPORT_VELOCITY_COMPOUND_COLUMNS,
  makeDescriptor: makeReportVelocityGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'Honest absence. A velocity row is a 30-day SUM over sku_stock_ledger — there is no record behind it to open, and the SKU itself already has a page (/inventory/health/sku/[sku]), which the row title links to. A record plane here would either duplicate that page or invent an editor over an aggregate.',
  },
};
