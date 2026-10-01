/** `receiving.unfound` — Unfound-queue table definition (plan Phase 1, wave 2). */

import type { QueueRow } from '../queue-table/unfound-queue-shared';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { UNFOUND_SHEET_COLUMNS, type UnfoundGridColumn } from './unfound-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { UNFOUND_GRID_CAPABILITIES, makeUnfoundGridDescriptor } from './unfound-grid-descriptor';

const UNFOUND_TABLE_DEFINITION = parseTableDefinition({
  id: 'receiving.unfound',
  tableId: 'unfound',
  entityFamily: 'unfound',
  cellMapKey: 'unfound',
  ariaLabel: 'Unfound queue',
  testId: 'unfound-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: UNFOUND_GRID_CAPABILITIES,
  columns: UNFOUND_SHEET_COLUMNS,
});

export const UNFOUND_TABLE_BINDING: TableSurfaceBinding<QueueRow, UnfoundGridColumn> = {
  definition: UNFOUND_TABLE_DEFINITION,
  columns: UNFOUND_SHEET_COLUMNS,
  makeDescriptor: makeUnfoundGridDescriptor,
  // No desk mounts this table since the PO Mailbox door was retired
  // (2026-09-25): its only host and its right-rail detail panel are gone. The
  // family stays registered for its data-table column layout and field catalog.
  recordPlane: {
    kind: 'none',
    reason:
      'Unmounted — the PO Mailbox door that hosted the unfound queue was retired; no row opens anything.',
  },
};
