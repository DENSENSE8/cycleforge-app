/** Unbox / History / Testing grid surface descriptor (plan Phase C) — lifts the house `RECEIVING_GRID_COLUMNS` SoT into the TanStack defs… */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  defaultDirForReceivingGridSort,
  isReceivingGridFrozen,
  isReceivingGridSortable,
  type ReceivingGridColumn,
} from '@/lib/receiving/receiving-grid-layout';

/** Receiving / Unbox browse — pick carton; no staff triage row wash. */
export const RECEIVING_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  dayBands: true,
};

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
    RECEIVING_GRID_CAPABILITIES,
  );
}

// No pre-built canonical descriptor:
