/** Local Pickup grid surface descriptor — lifts the MOUNTED column model (a `SlotLayout` materialization since the Wave-2 hand-model kill)… */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { PickupLine } from '../pickup-lines';
import {
  defaultDirForPickupColumn,
  isPickupColumnSortable,
  type PickupGridColumn,
} from './pickup-grid-layout';

/** Local Pickup browse — read-only map (empty select gutter); no triage wash. */
export const PICKUP_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from the RESOLVED column list, so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render.
 */
export function makePickupGridDescriptor(
  columns: readonly PickupGridColumn[],
): GridSurfaceDescriptor<PickupLine, PickupGridColumn> {
  return makeGridSurfaceDescriptor<PickupLine, PickupGridColumn>(
    'pickup.browse',
    columns,
    {
      isSortable: (key) => isPickupColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForPickupColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`select · title`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    PICKUP_GRID_CAPABILITIES,
  );
}
