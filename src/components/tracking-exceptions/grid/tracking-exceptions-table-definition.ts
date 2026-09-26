/** `ops.tracking-exceptions` — Tracking-exceptions table definition (plan Phase 1, wave 2). */

import type { TrackingExceptionRow } from '../types';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  TRACKING_EXCEPTIONS_SHEET_COLUMNS,
  type TrackingExceptionsGridColumn,
} from './tracking-exceptions-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  TRACKING_EXCEPTIONS_GRID_CAPABILITIES,
  makeTrackingExceptionsGridDescriptor,
} from './tracking-exceptions-grid-descriptor';

const TRACKING_EXCEPTIONS_TABLE_DEFINITION = parseTableDefinition({
  id: 'ops.tracking-exceptions',
  tableId: 'tracking-exceptions',
  entityFamily: 'tracking-exceptions',
  cellMapKey: 'tracking-exceptions',
  ariaLabel: 'Tracking exceptions',
  testId: 'tracking-exceptions-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: TRACKING_EXCEPTIONS_GRID_CAPABILITIES,
  columns: TRACKING_EXCEPTIONS_SHEET_COLUMNS,
});

export const TRACKING_EXCEPTIONS_TABLE_BINDING: TableSurfaceBinding<
  TrackingExceptionRow,
  TrackingExceptionsGridColumn
> = {
  definition: TRACKING_EXCEPTIONS_TABLE_DEFINITION,
  columns: TRACKING_EXCEPTIONS_SHEET_COLUMNS,
  makeDescriptor: makeTrackingExceptionsGridDescriptor,
  // Correcting an exception is a short, complete form with a commit — a modal,
  // not a peek an operator reads alongside the queue.
  recordPlane: {
    kind: 'dialog',
    reason: 'Correction is a short form with an explicit commit, not a reading pane.',
  },
};
