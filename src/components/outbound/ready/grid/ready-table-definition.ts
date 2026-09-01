/**
 * `outbound.ready` — Ready-to-ship table definition (plan Phase 1, wave 2).
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference;
 * the shell recipe, aria name, testid and prefs bucket are the literals the
 * mount used to carry.
 *
 * `columns` is the PRODUCT-DEFAULT materialization (wave 1.1 slot port), not a
 * hand array — the canonical shape the definition guards. A mount with an org
 * or staff layout passes its own materialization to `DataTable`.
 */

import type { AllocationHit } from '@/lib/channel-allocation';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { READY_SHEET_COLUMNS, type ReadyGridColumn } from './ready-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { READY_GRID_CAPABILITIES, makeReadyGridDescriptor } from './ready-grid-descriptor';

export const READY_TABLE_DEFINITION = parseTableDefinition({
  id: 'outbound.ready',
  tableId: 'ready',
  entityFamily: 'ready',
  cellMapKey: 'ready',
  ariaLabel: 'Recently tested units',
  testId: 'ready-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: READY_GRID_CAPABILITIES,
  columns: READY_SHEET_COLUMNS,
});

export const READY_TABLE_BINDING: TableSurfaceBinding<AllocationHit, ReadyGridColumn> = {
  definition: READY_TABLE_DEFINITION,
  columns: READY_SHEET_COLUMNS,
  makeDescriptor: makeReadyGridDescriptor,
  // Append-only testing history: a row records that a unit passed test, and
  // there is no version of that fact to correct. The row's one affordance is the
  // Stage-FBA link, which navigates. Nothing opens a peek here, so declaring an
  // inspector would promise a panel that does not exist.
  recordPlane: {
    kind: 'none',
    reason:
      'Append-only testing history — no record to open or correct; the row action is a Stage-FBA link.',
  },
};
