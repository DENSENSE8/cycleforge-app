/**
 * Warranty claims grid surface descriptor — lifts the house
 * {@link WARRANTY_GRID_COLUMNS} SoT into the TanStack defs `LedgerGridSurface`
 * mounts. Sorting stays inside the warranty sort vocabulary; row ORDER stays
 * with the house comparator in `WarrantyClaimsTable` (state math only).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { WarrantyClaimListRow } from '@/lib/warranty/types';
import {
  defaultDirForWarrantyGridSort,
  isWarrantyGridFrozen,
  isWarrantyGridSortable,
  type WarrantyGridColumn,
} from './warranty-grid-layout';

/**
 * Warranty claims browse — read map + one row-scoped action (link a ticket).
 *
 * `multiSelect: false`: nothing on this surface acts on N claims at once, and a
 * gutter with no wiring behind it is the inert-gutter the workbench law bans.
 * `rowTriageFlags: false` — triage wash is outbound dispatch vocabulary; a claim
 * carries its own status and warranty clock, and a second colour story on top of
 * those would be chrome inventing a fact (Kinetic Ledger law 1).
 */
export const WARRANTY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
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
      isSortable: isWarrantyGridSortable,
      sortDescFirst: (key) => defaultDirForWarrantyGridSort(key) === 'desc',
      isLocked: isWarrantyGridFrozen,
    },
    WARRANTY_GRID_CAPABILITIES,
  );
}

// No pre-built canonical descriptor: the column set is resolved per staffer by
// `useGridColumnVisibility`, so the warranty grid mount always builds from the
// RESOLVED list (which keeps `contentMinWidthRem` and the CSS grid template
// honest when a track is hidden).
