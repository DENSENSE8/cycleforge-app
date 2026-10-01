/** `admin-returns.recent` — the Returns dock table definition. */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { RecentReturnRow } from '@/lib/inventory/returns-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  ADMIN_RETURNS_COMPOUND_COLUMNS,
  defaultDirForAdminReturnsColumn,
  isAdminReturnsColumnSortable,
  type AdminReturnsGridColumn,
} from './admin-returns-grid-layout';

/** A returns log is a READ surface: */
export const ADMIN_RETURNS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  dayBands: false,
};

/** Build the descriptor from a RESOLVED column list (post-visibility), so `contentMinWidthRem` and the TanStack defs follow the tracks that… */
function makeAdminReturnsGridDescriptor(
  columns: readonly AdminReturnsGridColumn[],
): GridSurfaceDescriptor<RecentReturnRow, AdminReturnsGridColumn> {
  return makeGridSurfaceDescriptor<RecentReturnRow, AdminReturnsGridColumn>(
    'admin-returns.recent',
    columns,
    {
      isSortable: (key) => isAdminReturnsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForAdminReturnsColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    ADMIN_RETURNS_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
const ADMIN_RETURNS_TABLE_DEFINITION = parseTableDefinition({
  id: 'admin-returns.recent',
  tableId: 'admin-returns',
  entityFamily: 'admin-returns',
  // The Ledger's cells, not a second map — a returns row IS an inventory event.
  cellMapKey: 'inventory-events',
  ariaLabel: 'Recent returns',
  testId: 'admin-returns-grid-body',
  surface: 'sheet',
  // The dock bands by the intake instant, and the compound feed paints one
  // band — the stamp is a per-row track, not a sticky day header.
  showDayHeaders: false,
  capabilities: ADMIN_RETURNS_GRID_CAPABILITIES,
  columns: ADMIN_RETURNS_COMPOUND_COLUMNS,
});

export const ADMIN_RETURNS_TABLE_BINDING: TableSurfaceBinding<
  RecentReturnRow,
  AdminReturnsGridColumn
> = {
  definition: ADMIN_RETURNS_TABLE_DEFINITION,
  columns: ADMIN_RETURNS_COMPOUND_COLUMNS,
  makeDescriptor: makeAdminReturnsGridDescriptor,
  /** The row IS a unit's timeline entry, and the page's own docblock names the reach-through it has always had: */
  recordPlane: {
    kind: 'navigate',
    reason:
      'A returns row is one unit event; picking it opens /inventory?unit=<serial_unit_id>, the unit timeline the retired table linked per row.',
  },
};
