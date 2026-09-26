/** `reports.bin-utilization` — the table definition, capabilities and surface descriptor for the bin-utilization report. */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { BinUtilizationReportRow } from '@/lib/reports/report-rows';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS,
  defaultDirForReportBinUtilizationColumn,
  isReportBinUtilizationColumnSortable,
  type ReportBinUtilizationGridColumn,
} from './report-bin-utilization-grid-layout';

/** Nothing on this desk writes. */
export const REPORT_BIN_UTILIZATION_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeReportBinUtilizationGridDescriptor(
  columns: readonly ReportBinUtilizationGridColumn[],
): GridSurfaceDescriptor<BinUtilizationReportRow, ReportBinUtilizationGridColumn> {
  return makeGridSurfaceDescriptor<BinUtilizationReportRow, ReportBinUtilizationGridColumn>(
    'reports.bin-utilization',
    columns,
    {
      isSortable: (key) => isReportBinUtilizationColumnSortable(columns, key),
      sortDescFirst: (key) =>
        defaultDirForReportBinUtilizationColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    REPORT_BIN_UTILIZATION_GRID_CAPABILITIES,
  );
}

export const REPORT_BIN_UTILIZATION_TABLE_DEFINITION = parseTableDefinition({
  id: 'reports.bin-utilization',
  tableId: 'report-bin-utilization',
  entityFamily: 'report-bin-utilization',
  cellMapKey: 'report-bin-utilization',
  ariaLabel: 'Bin utilization',
  testId: 'report-bin-utilization-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: REPORT_BIN_UTILIZATION_GRID_CAPABILITIES,
  columns: REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS,
});

export const REPORT_BIN_UTILIZATION_TABLE_BINDING: TableSurfaceBinding<
  BinUtilizationReportRow,
  ReportBinUtilizationGridColumn
> = {
  definition: REPORT_BIN_UTILIZATION_TABLE_DEFINITION,
  columns: REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS,
  makeDescriptor: makeReportBinUtilizationGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'Honest absence. A utilization row is a read-only projection of mv_bin_utilization — there is no record behind it to edit, and the BIN itself already has a desk (Warehouse › Bins, tableId `bins`) with its own facts and its own plane. Opening a record plane here would either duplicate that desk or invent an editor over a materialized view.',
  },
};
