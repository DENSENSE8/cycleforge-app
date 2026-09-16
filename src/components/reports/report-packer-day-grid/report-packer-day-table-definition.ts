/**
 * `reports.packer-day` — the table definition, capabilities and surface
 * descriptor for the per-pack shift report.
 *
 * Re-declares nothing: columns are the family SoT by reference.
 *
 * Its OWN tableId, like its three siblings: a pack-scan row shares no facts
 * with a SKU dormancy row, and the Fields menu keys off `tableId` — hiding
 * `Tier` here must not touch Staff day or Velocity.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  REPORT_PACKER_DAY_COMPOUND_COLUMNS,
  defaultDirForReportPackerDayColumn,
  isReportPackerDayColumnSortable,
  type ReportPackerDayGridColumn,
} from './report-packer-day-grid-layout';

/**
 * Nothing on this desk writes. A pack scan is a RECORD of something that
 * happened — the editable thing is the SKU's standard, and that lives on the
 * product record the row title links to. `multiSelect` stays on for the shared
 * copy-TSV bar: lifting a packer's day into a message is a reason this table
 * is opened.
 */
export const REPORT_PACKER_DAY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeReportPackerDayGridDescriptor(
  columns: readonly ReportPackerDayGridColumn[],
): GridSurfaceDescriptor<PackingReportRow, ReportPackerDayGridColumn> {
  return makeGridSurfaceDescriptor<PackingReportRow, ReportPackerDayGridColumn>(
    'reports.packer-day',
    columns,
    {
      isSortable: (key) => isReportPackerDayColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForReportPackerDayColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    REPORT_PACKER_DAY_GRID_CAPABILITIES,
  );
}

export const REPORT_PACKER_DAY_TABLE_DEFINITION = parseTableDefinition({
  id: 'reports.packer-day',
  tableId: 'report-packer-day',
  entityFamily: 'report-packer-day',
  cellMapKey: 'report-packer-day',
  ariaLabel: 'Packer day, one row per pack',
  testId: 'report-packer-day-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: REPORT_PACKER_DAY_GRID_CAPABILITIES,
  columns: REPORT_PACKER_DAY_COMPOUND_COLUMNS,
});

export const REPORT_PACKER_DAY_TABLE_BINDING: TableSurfaceBinding<
  PackingReportRow,
  ReportPackerDayGridColumn
> = {
  definition: REPORT_PACKER_DAY_TABLE_DEFINITION,
  columns: REPORT_PACKER_DAY_COMPOUND_COLUMNS,
  makeDescriptor: makeReportPackerDayGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'A pack-scan row is an event, not an entity with a desk of its own: it is one station_activity_logs row plus its packer_log_enrichment. The two things an operator wants FROM it already have homes the row links or defers to — the SKU’s time to pack on the product record (titleHref), and the pack itself in Packing Review (packerLogId). A record plane here would be a third face over an immutable event.',
  },
};
