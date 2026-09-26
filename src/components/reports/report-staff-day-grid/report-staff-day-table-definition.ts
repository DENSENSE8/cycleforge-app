/** `reports.staff-day` — the table definition, capabilities and surface descriptor for the per-staff-per-day shift report. */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { StaffDayReportRow } from '@/lib/reports/staff-day-rows';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  REPORT_STAFF_DAY_COMPOUND_COLUMNS,
  defaultDirForReportStaffDayColumn,
  isReportStaffDayColumnSortable,
  type ReportStaffDayGridColumn,
} from './report-staff-day-grid-layout';

/**
 * Nothing on this desk writes — the operator asked for "view only in a
 * manager". `multiSelect` stays on for the shared copy-TSV bar: lifting a
 * staffer's missed checks into a message is the reason this table is opened.
 */
export const REPORT_STAFF_DAY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeReportStaffDayGridDescriptor(
  columns: readonly ReportStaffDayGridColumn[],
): GridSurfaceDescriptor<StaffDayReportRow, ReportStaffDayGridColumn> {
  return makeGridSurfaceDescriptor<StaffDayReportRow, ReportStaffDayGridColumn>(
    'reports.staff-day',
    columns,
    {
      isSortable: (key) => isReportStaffDayColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForReportStaffDayColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    REPORT_STAFF_DAY_GRID_CAPABILITIES,
  );
}

export const REPORT_STAFF_DAY_TABLE_DEFINITION = parseTableDefinition({
  id: 'reports.staff-day',
  tableId: 'report-staff-day',
  entityFamily: 'report-staff-day',
  cellMapKey: 'report-staff-day',
  ariaLabel: 'Staff day, one row per staffer and task',
  testId: 'report-staff-day-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: REPORT_STAFF_DAY_GRID_CAPABILITIES,
  columns: REPORT_STAFF_DAY_COMPOUND_COLUMNS,
});

export const REPORT_STAFF_DAY_TABLE_BINDING: TableSurfaceBinding<
  StaffDayReportRow,
  ReportStaffDayGridColumn
> = {
  definition: REPORT_STAFF_DAY_TABLE_DEFINITION,
  columns: REPORT_STAFF_DAY_COMPOUND_COLUMNS,
  makeDescriptor: makeReportStaffDayGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'Honest absence. A staff-day row is a projection of the daily-check report (items × one staffer’s marks) — there is no record behind it to open. A record plane here would invent an editor over an attestation.',
  },
};
