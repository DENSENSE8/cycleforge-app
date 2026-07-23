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
  RECEIVING_GRID_COLUMNS,
  defaultDirForReceivingGridSort,
  isReceivingGridFrozen,
  isReceivingGridSortable,
  receivingContentMinWidthRem,
  type ReceivingGridColumn,
} from '@/lib/receiving/receiving-grid-layout';

export function makeReceivingGridDescriptor(
  columns: readonly ReceivingGridColumn[],
): GridSurfaceDescriptor<ReceivingLineRow, ReceivingGridColumn> {
  return makeGridSurfaceDescriptor<ReceivingLineRow, ReceivingGridColumn>(
    'receiving.browse',
    columns,
    receivingContentMinWidthRem(columns),
    {
      isSortable: isReceivingGridSortable,
      sortDescFirst: (key) => defaultDirForReceivingGridSort(key) === 'desc',
      isLocked: isReceivingGridFrozen,
    },
  );
}

/** Canonical Unbox / History / Testing descriptor (default column set). */
export const RECEIVING_GRID_DESCRIPTOR = makeReceivingGridDescriptor(RECEIVING_GRID_COLUMNS);
