/**
 * `receiving.unfound` — Unfound-queue table definition (plan Phase 1, wave 2).
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference;
 * the shell recipe, aria name, testid and prefs bucket are the literals the
 * mount used to carry. Capabilities ride through untouched — they are a property
 * of the family bag, and the host does not gate on them.
 */

import type { QueueRow } from '../queue-table/unfound-queue-shared';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { UNFOUND_GRID_COLUMNS, type UnfoundGridColumn } from './unfound-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { UNFOUND_GRID_CAPABILITIES, makeUnfoundGridDescriptor } from './unfound-grid-descriptor';

export const UNFOUND_TABLE_DEFINITION = parseTableDefinition({
  id: 'receiving.unfound',
  tableId: 'unfound',
  entityFamily: 'unfound',
  cellMapKey: 'unfound',
  ariaLabel: 'Unfound queue',
  testId: 'unfound-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: UNFOUND_GRID_CAPABILITIES,
  columns: UNFOUND_GRID_COLUMNS,
});

export const UNFOUND_TABLE_BINDING: TableSurfaceBinding<QueueRow, UnfoundGridColumn> = {
  definition: UNFOUND_TABLE_DEFINITION,
  columns: UNFOUND_GRID_COLUMNS,
  makeDescriptor: makeUnfoundGridDescriptor,
  // Triage happens IN the cell (`LedgerCellEditor` PATCHes ticket + note), and
  // the row's open gesture goes to the SOURCE the line came from. There is no
  // unfound-line record to peek at — the row is the absence of one.
  recordPlane: {
    kind: 'navigate',
    reason:
      'Triage is in-cell; the open gesture goes to the source record the line failed to match.',
  },
};
