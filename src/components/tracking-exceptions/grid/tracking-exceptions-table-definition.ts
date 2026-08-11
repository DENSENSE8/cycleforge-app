/**
 * `ops.tracking-exceptions` — Tracking-exceptions table definition (plan Phase 1,
 * wave 2).
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference;
 * the shell recipe, aria name, testid and prefs bucket are the literals the
 * mount used to carry. The descriptor id was kebabbed from `ops.trackingExceptions`
 * to satisfy the `<family>.<view>` id contract (it had no reader before this).
 */

import type { TrackingExceptionRow } from '../types';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  TRACKING_EXCEPTIONS_GRID_COLUMNS,
  type TrackingExceptionsGridColumn,
} from './tracking-exceptions-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  TRACKING_EXCEPTIONS_GRID_CAPABILITIES,
  makeTrackingExceptionsGridDescriptor,
} from './tracking-exceptions-grid-descriptor';

export const TRACKING_EXCEPTIONS_TABLE_DEFINITION = parseTableDefinition({
  id: 'ops.tracking-exceptions',
  tableId: 'tracking-exceptions',
  entityFamily: 'tracking-exceptions',
  cellMapKey: 'tracking-exceptions',
  ariaLabel: 'Tracking exceptions',
  testId: 'tracking-exceptions-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: TRACKING_EXCEPTIONS_GRID_CAPABILITIES,
  columns: TRACKING_EXCEPTIONS_GRID_COLUMNS,
});

export const TRACKING_EXCEPTIONS_TABLE_BINDING: TableSurfaceBinding<
  TrackingExceptionRow,
  TrackingExceptionsGridColumn
> = {
  definition: TRACKING_EXCEPTIONS_TABLE_DEFINITION,
  columns: TRACKING_EXCEPTIONS_GRID_COLUMNS,
  makeDescriptor: makeTrackingExceptionsGridDescriptor,
  // Ruled honest-absence — `NO_DESK_PEEK_SURFACES` in band3-find-only.guard.
  recordPlane: {
    kind: 'dialog',
    reason: 'ops triage — rows open an edit dialog, not a RightRailHost desk peek',
  },
};
