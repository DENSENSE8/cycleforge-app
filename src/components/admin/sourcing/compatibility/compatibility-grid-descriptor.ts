/**
 * Compatibility rules grid surface descriptor — lifts the MOUNTED column model (a
 * `SlotLayout` materialization) into the TanStack defs `LedgerGridSurface`
 * mounts.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { CompatibilityEdgeRow } from '@/lib/sourcing/compatibility-edge-row';
import {
  defaultDirForCompatibilityColumn,
  isCompatibilityColumnSortable,
  type CompatibilityGridColumn,
} from './compatibility-grid-layout';

/**
 * Edge verbs (delete a rule) run from the ROW MENU, not an actions column.
 */
export const COMPATIBILITY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeCompatibilityGridDescriptor(
  columns: readonly CompatibilityGridColumn[],
): GridSurfaceDescriptor<CompatibilityEdgeRow, CompatibilityGridColumn> {
  return makeGridSurfaceDescriptor<CompatibilityEdgeRow, CompatibilityGridColumn>(
    'admin.compatibility',
    columns,
    {
      isSortable: (key) => isCompatibilityColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForCompatibilityColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    COMPATIBILITY_GRID_CAPABILITIES,
  );
}
