/**
 * Repair queue grid surface descriptor — lifts the house `REPAIR_GRID_COLUMNS`
 * SoT into the TanStack defs `LedgerGridSurface` mounts. Sorting stays inside
 * the repair sort vocabulary (`isRepairGridSortable`); row ORDER stays with the
 * house comparator (`compareRepairGridRows`) — the defs are state math only.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import {
  defaultDirForRepairColumn,
  isRepairColumnSortable,
  type RepairGridColumn,
} from '@/lib/repair/repair-grid-layout';

/** Repair queue — multi-select + Fields; no staff triage row wash. */
export const REPAIR_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render — a hidden column loses its width, not just its content.
 */
export function makeRepairGridDescriptor(
  columns: readonly RepairGridColumn[],
): GridSurfaceDescriptor<RSRecord, RepairGridColumn> {
  return makeGridSurfaceDescriptor<RSRecord, RepairGridColumn>(
    'repair.queue',
    columns,
    {
      isSortable: (key) => isRepairColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForRepairColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`select · title`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    REPAIR_GRID_CAPABILITIES,
  );
}

// No pre-built canonical descriptor: the column set is now resolved per staffer
// by `useGridColumnVisibility`, so the repair grid mount always builds from the
// RESOLVED list (which also keeps `contentMinWidthRem` and the CSS grid template
// honest when a track is hidden). A module-level constant built from the full
// column list would have been wrong for every staffer with a delta.
