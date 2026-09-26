/** Ready / recently-tested grid surface descriptor — lifts the MOUNTED column model (a `SlotLayout` materialization since the wave 1.1… */

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

/** Ready history — a read map with one row-scoped escape (Stage FBA). */
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
