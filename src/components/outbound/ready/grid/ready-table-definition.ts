/**
 * `outbound.ready` — Ready-to-ship table definition (plan Phase 1, wave 2).
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference;
 * the shell recipe, aria name, testid and prefs bucket are the literals the
 * mount used to carry.
 */

import type { AllocationHit } from '@/lib/channel-allocation';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { READY_GRID_COLUMNS, type ReadyGridColumn } from './ready-grid-layout';
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
  columns: READY_GRID_COLUMNS,
});

export const READY_TABLE_BINDING: TableSurfaceBinding<AllocationHit, ReadyGridColumn> = {
  definition: READY_TABLE_DEFINITION,
  columns: READY_GRID_COLUMNS,
  makeDescriptor: makeReadyGridDescriptor,
  // Honest absence, and it predates this field: `ReadyGridRow` already refuses
  // `role="button"` and overrides the shared fill helper's `cursor-pointer`,
  // because a pointer would promise an interaction that does not exist.
  recordPlane: {
    kind: 'none',
    reason:
      'append-only tested-hit history — these rows have no record plane to open; the only affordance is the action cell Stage-FBA link',
  },
};
