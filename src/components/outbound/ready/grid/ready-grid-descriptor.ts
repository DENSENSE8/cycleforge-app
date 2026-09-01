/**
 * Ready / recently-tested grid surface descriptor — lifts the MOUNTED column
 * model (a `SlotLayout` materialization since the wave 1.1 hand-model kill)
 * into the TanStack defs `LedgerGridSurface` mounts. Sortability, default
 * direction and locks all derive from the columns handed in — never a module
 * constant. Row ORDER stays with the house comparator in `ReadyQueueTable`
 * (state math only).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { AllocationHit } from '@/lib/channel-allocation';
import {
  defaultDirForReadyColumn,
  isReadyColumnSortable,
  type ReadyGridColumn,
} from './ready-grid-layout';

/**
 * Ready history — a read map with one row-scoped escape (Stage FBA).
 *
 * Every mutating flag is `false`, and that is the point of the surface: these
 * are append-only `testing_results` rows. There is no record to correct here and
 * nothing to act on in bulk — the work happens on the FBA board the action cell
 * links to. `rowTriageFlags` stays off because a row already carries a verdict
 * AND a destination; a third colour story would be chrome inventing a fact.
 *
 * `fieldsMenu` is now HONEST: the Fields + popover has catalog data to offer
 * (`READY_FIELD_CATALOG`). Before the port it was `true` over nothing.
 */
export const READY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from the RESOLVED column list, so `contentMinWidthRem`
 * and the TanStack defs follow the tracks that actually render.
 */
export function makeReadyGridDescriptor(
  columns: readonly ReadyGridColumn[],
): GridSurfaceDescriptor<AllocationHit, ReadyGridColumn> {
  return makeGridSurfaceDescriptor<AllocationHit, ReadyGridColumn>(
    'outbound.ready',
    columns,
    {
      isSortable: (key) => isReadyColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForReadyColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`select · title`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    READY_GRID_CAPABILITIES,
  );
}
