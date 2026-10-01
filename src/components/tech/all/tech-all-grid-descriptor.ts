/**
 * Tech All triage grid surface descriptor — lifts {@link TECH_ALL_GRID_COLUMNS}
 * into the TanStack defs `LedgerGridSurface` mounts.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { TechAllTriageRow } from '@/lib/tech/tech-all-triage';
import {
  defaultDirForTechAllColumn,
  isTechAllColumnSortable,
  type TechAllGridColumn,
} from '@/lib/tech/tech-all-grid-layout';

/**
 * Cross-queue triage browse — pick a typed row and open its home station.
 * No bulk, no in-cell edit, no day bands. Fields menu on for type/stage/urgency.
 */
export const TECH_ALL_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  dayBands: false,
};

export function makeTechAllGridDescriptor(
  columns: readonly TechAllGridColumn[],
): GridSurfaceDescriptor<TechAllTriageRow, TechAllGridColumn> {
  return makeGridSurfaceDescriptor<TechAllTriageRow, TechAllGridColumn>(
    'tech.all',
    columns,
    {
      isSortable: (key) => isTechAllColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForTechAllColumn(columns, key) === 'desc',
      // Locked = the mounted model's own frozen prefix (`select · identity`).
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    TECH_ALL_GRID_CAPABILITIES,
  );
}
