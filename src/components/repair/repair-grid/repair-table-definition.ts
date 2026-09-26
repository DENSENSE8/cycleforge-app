/**
 * `repair.queue` — Repair-queue table definition (plan Phase 1, wave 3).
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference;
 * the shell recipe, aria name, testid and prefs bucket are the literals the
 * mount used to carry.
 */

import type { RSRecord } from '@/lib/neon/repair-service-queries';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { REPAIR_SHEET_COLUMNS, type RepairGridColumn } from '@/lib/repair/repair-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { REPAIR_GRID_CAPABILITIES, makeRepairGridDescriptor } from './repair-grid-descriptor';

export const REPAIR_TABLE_DEFINITION = parseTableDefinition({
  id: 'repair.queue',
  tableId: 'repair',
  entityFamily: 'repair',
  cellMapKey: 'repair',
  ariaLabel: 'Repair queue',
  testId: 'repair-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: REPAIR_GRID_CAPABILITIES,
  columns: REPAIR_SHEET_COLUMNS,
});

export const REPAIR_TABLE_BINDING: TableSurfaceBinding<RSRecord, RepairGridColumn> = {
  definition: REPAIR_TABLE_DEFINITION,
  columns: REPAIR_SHEET_COLUMNS,
  makeDescriptor: makeRepairGridDescriptor,
  // `RepairRecordView` on DeskRecordPlane, keyed on `?openRepair=` — the
  // desk record, and the landing target for a printed repair QR.
  recordPlane: {
    kind: 'stage-overlay',
    reason:
      'The repair opens on DeskRecordPlane — in place of the queue, or beside it in fullscreen (?openRepair=).',
  },
};
