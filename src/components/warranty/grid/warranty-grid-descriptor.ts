/** Warranty claims grid surface descriptor — lifts the house {@link WARRANTY_GRID_COLUMNS} SoT into the TanStack defs `LedgerGridSurface`… */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { WarrantyClaimListRow } from '@/lib/warranty/types';
import {
  defaultDirForWarrantyColumn,
  isWarrantyColumnSortable,
  type WarrantyGridColumn,
} from './warranty-grid-layout';

/** Warranty claims browse — read map + one row-scoped action (link a ticket). */
export const WARRANTY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render — a hidden column loses its width, not just its content.
 */
export function makeWarrantyGridDescriptor(
  columns: readonly WarrantyGridColumn[],
): GridSurfaceDescriptor<WarrantyClaimListRow, WarrantyGridColumn> {
  return makeGridSurfaceDescriptor<WarrantyClaimListRow, WarrantyGridColumn>(
    'support.warranty',
    columns,
    {
      isSortable: (key) => isWarrantyColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForWarrantyColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`select · title`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    WARRANTY_GRID_CAPABILITIES,
  );
}

// No pre-built canonical descriptor:
