/**
 * `reports.velocity` — the table definition, capabilities and surface
 * descriptor for the 30-day SKU-velocity report.
 *
 * Re-declares nothing: columns are the family SoT by reference.
 *
 * Its OWN tableId, never shared with the other two reports: three different
 * row shapes cannot share one layout document, and the Fields menu keys off
 * `tableId` — so hiding `In` here must not touch Bin utilization or Dead
 * stock. It is also a SIBLING of `report-dead-stock`, never a merge: both rows
 * are keyed by SKU, but one answers "what is moving" over a 30-day window and
 * the other "what has not moved in 90+ days", and they carry different facts.
 */

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

/**
 * Nothing on this desk writes. A velocity row is an aggregate projection over
 * the stock ledger — no row verbs, no cell editing, no triage flags.
 *
 * `multiSelect` stays on for the bulk copy-TSV bar every slot peer carries:
 * lifting the top movers into a purchasing plan is the reason this report is
 * opened at all.
 */
export const REPORT_VELOCITY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeReportVelocityGridDescriptor(
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

export const REPORT_VELOCITY_TABLE_DEFINITION = parseTableDefinition({
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
