/**
 * `reports.bin-utilization` — the table definition, capabilities and surface
 * descriptor for the bin-utilization report.
 *
 * Re-declares nothing: columns are the family SoT by reference.
 *
 * Its OWN tableId, never shared with the other two reports: three different
 * row shapes cannot share one layout document, and the Fields menu keys off
 * `tableId` — so hiding `Cap` here must not touch Velocity or Dead stock. It
 * is also not the Warehouse `bins` family: that row is `BinsOverviewRow` with
 * count stamps and four flags this MV projection does not carry, so reusing it
 * would mean inventing the facts it is missing.
 */

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

/**
 * Nothing on this desk writes. A report row is a projection over a
 * materialized view — there are no row verbs, no cell editing and no triage
 * flags; the only thing an operator does with a page of them is read, narrow
 * and lift.
 *
 * `multiSelect` stays on for the bulk copy-TSV bar every slot peer carries:
 * pulling a run of over-full bins into a re-slotting plan is the reason this
 * report is opened at all.
 */
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
