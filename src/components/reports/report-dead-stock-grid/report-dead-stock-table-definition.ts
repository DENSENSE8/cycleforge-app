/**
 * `reports.dead-stock` — the table definition, capabilities and surface
 * descriptor for the dead-stock (90d+) report.
 *
 * Re-declares nothing: columns are the family SoT by reference.
 *
 * Its OWN tableId, never shared with the other two reports: three different
 * row shapes cannot share one layout document, and the Fields menu keys off
 * `tableId` — so hiding `Stock` here must not touch Bin utilization or
 * Velocity. It is a SIBLING of `report-velocity`, never a merge: both rows are
 * keyed by SKU, but one answers "what is moving" over a 30-day window and the
 * other "what has not moved in 90+ days", and they carry different facts.
 */

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

/**
 * Nothing on this desk writes. A dead-stock row is a projection over
 * `sku_stock` and the ledger — no row verbs, no cell editing, no triage flags.
 *
 * `multiSelect` stays on for the bulk copy-TSV bar every slot peer carries:
 * lifting a run of dormant SKUs into a clearance list is the reason this
 * report is opened at all.
 */
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
