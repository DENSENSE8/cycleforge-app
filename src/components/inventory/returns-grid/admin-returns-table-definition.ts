/**
 * `admin-returns.recent` — the Returns dock table definition.
 *
 * A SIBLING of the Ledger's `inventory-events.browse`: the same entity read
 * through a narrower `WHERE`, mounting the same cells (`cellMapKey:
 * 'inventory-events'`) under its OWN prefs bucket, because hiding a fact on
 * the returns dock must not densify the Ledger. That is the `incoming` /
 * `receiving` pattern verbatim — two tableIds, one cell map.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference,
 * and the canonical columns are the product-default MATERIALIZATION
 * (`ADMIN_RETURNS_COMPOUND_COLUMNS`), never a hand array.
 */

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

/**
 * A returns log is a READ surface: the intake already happened, and the one
 * verb this page has (record a return) is the FORM above the table, not a cell.
 * `multiSelect` stays off — there is no bulk verb to select rows for, and the
 * gutter checkbox would be a control with no verb behind it.
 */
export const ADMIN_RETURNS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render. `columns` is REQUIRED: a module-constant default is the `grid-default`
 * debt the discover scanner deletes — inheriting a column model by silence is
 * how a second SoT gets minted.
 */
export function makeAdminReturnsGridDescriptor(
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
export const ADMIN_RETURNS_TABLE_DEFINITION = parseTableDefinition({
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
  /**
   * The row IS a unit's timeline entry, and the page's own docblock names the
   * reach-through it has always had: "each unit linked through to its
   * timeline". That destination is a ROUTE (`/inventory?unit=<id>`),
   * not a panel — so the plane is `navigate`, and the retired `<Link>` in the
   * unit cell becomes the row's declared record plane instead of per-cell JSX.
   */
  recordPlane: {
    kind: 'navigate',
    reason:
      'A returns row is one unit event; picking it opens /inventory?unit=<serial_unit_id>, the unit timeline the retired table linked per row.',
  },
};
