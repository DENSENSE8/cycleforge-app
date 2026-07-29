/**
 * Unbox / History / Testing grid surface descriptor (plan Phase C) — lifts the
 * house `RECEIVING_GRID_COLUMNS` SoT into the TanStack defs
 * `LedgerGridSurface` mounts. Sorting stays inside the receiving sort
 * vocabulary; row ORDER stays with `compareReceivingGridRows` (state math
 * only — no TanStack grouping on day-band-capable surfaces, plan Phase E).
 */

import { makeGridSurfaceDescriptor, type GridSurfaceDescriptor } from '@/design-system/components/grid';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  defaultDirForReceivingGridSort,
  isReceivingGridFrozen,
  isReceivingGridSortable,
  type ReceivingGridColumn,
} from '@/lib/receiving/receiving-grid-layout';

export function makeReceivingGridDescriptor(
  columns: readonly ReceivingGridColumn[],
): GridSurfaceDescriptor<ReceivingLineRow, ReceivingGridColumn> {
  return makeGridSurfaceDescriptor<ReceivingLineRow, ReceivingGridColumn>(
    'receiving.browse',
    columns,
    {
      isSortable: isReceivingGridSortable,
      sortDescFirst: (key) => defaultDirForReceivingGridSort(key) === 'desc',
      isLocked: isReceivingGridFrozen,
    },
  );
}

// No pre-built canonical descriptor: the column set is now resolved per staffer
// by `useGridColumnVisibility`, so `ReceivingGridView` always builds from the
// RESOLVED list (which also keeps `contentMinWidthRem` and the CSS grid
// template honest when a track is hidden). A module-level constant built from
// the full column list would have been wrong for every staffer with a delta.
