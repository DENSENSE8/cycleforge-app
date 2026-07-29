/**
 * Repair queue grid surface descriptor — lifts the house `REPAIR_GRID_COLUMNS`
 * SoT into the TanStack defs `LedgerGridSurface` mounts. Sorting stays inside
 * the repair sort vocabulary (`isRepairGridSortable`); row ORDER stays with the
 * house comparator (`compareRepairGridRows`) — the defs are state math only.
 */

import { makeGridSurfaceDescriptor, type GridSurfaceDescriptor } from '@/design-system/components/grid';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import {
  defaultDirForRepairGridSort,
  isRepairGridFrozen,
  isRepairGridSortable,
  type RepairGridColumn,
} from '@/lib/repair/repair-grid-layout';

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
      isSortable: isRepairGridSortable,
      sortDescFirst: (key) => defaultDirForRepairGridSort(key) === 'desc',
      isLocked: isRepairGridFrozen,
    },
  );
}

// No pre-built canonical descriptor: the column set is now resolved per staffer
// by `useGridColumnVisibility`, so `RepairGridView` always builds from the
// RESOLVED list (which also keeps `contentMinWidthRem` and the CSS grid template
// honest when a track is hidden). A module-level constant built from the full
// column list would have been wrong for every staffer with a delta.
