/**
 * `admin-holds.held` — the Holds desk table definition, capabilities and
 * surface descriptor.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference,
 * and the canonical columns are the product-default MATERIALIZATION
 * (`ADMINHOLDS_COMPOUND_COLUMNS`), never a hand array.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { HeldUnitRow } from '@/lib/inventory/held-unit-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  ADMINHOLDS_COMPOUND_COLUMNS,
  defaultDirForAdminHoldsColumn,
  isAdminHoldsColumnSortable,
  type AdminHoldsGridColumn,
} from './admin-holds-grid-layout';

/**
 * `inCellEdit: false` — the point of the port. The retired desk put a
 * `<select>` and a submit button inside a table cell; a release carries a
 * per-unit parameter, so it is a row verb that opens a plane
 * (`HoldReleasePlane`), which is the Center-Lock L2 record plane (law Q5).
 *
 * `multiSelect: false` — there is no bulk verb to select rows FOR. Release is
 * the only verb and it is parameterised per unit (which lifecycle state this
 * one goes back to), so a bulk release would either ask one question for many
 * units or ask the same question n times. A gutter checkbox with no verb behind
 * it is a control that does nothing.
 */
export const ADMINHOLDS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so the
 * TanStack defs follow the tracks that actually render. `columns` is REQUIRED:
 * a module-constant default is the `grid-default` debt the discover scanner
 * deletes — inheriting a column model by silence mints a second SoT.
 */
export function makeAdminHoldsGridDescriptor(
  columns: readonly AdminHoldsGridColumn[],
): GridSurfaceDescriptor<HeldUnitRow, AdminHoldsGridColumn> {
  return makeGridSurfaceDescriptor<HeldUnitRow, AdminHoldsGridColumn>(
    'admin-holds.held',
    columns,
    {
      isSortable: (key) => isAdminHoldsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForAdminHoldsColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    ADMINHOLDS_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
export const ADMINHOLDS_TABLE_DEFINITION = parseTableDefinition({
  id: 'admin-holds.held',
  tableId: 'admin-holds',
  entityFamily: 'admin-holds',
  cellMapKey: 'admin-holds',
  ariaLabel: 'Units on hold',
  testId: 'admin-holds-grid-body',
  surface: 'sheet',
  // The desk bands by the hold instant and the compound feed paints one band —
  // the stamp is a per-row track, not a sticky day header.
  showDayHeaders: false,
  capabilities: ADMINHOLDS_GRID_CAPABILITIES,
  columns: ADMINHOLDS_COMPOUND_COLUMNS,
});

export const ADMINHOLDS_TABLE_BINDING: TableSurfaceBinding<HeldUnitRow, AdminHoldsGridColumn> = {
  definition: ADMINHOLDS_TABLE_DEFINITION,
  columns: ADMINHOLDS_COMPOUND_COLUMNS,
  makeDescriptor: makeAdminHoldsGridDescriptor,
  /**
   * The row IS a unit, and the retired `unit` cell linked every one of them to
   * `/inventory?unit=<id>` — the unit's own page, where the hold sits in
   * its timeline beside everything else that ever happened to it. That
   * destination is a ROUTE, not a panel, so the plane is `navigate` and the
   * `<Link>` in the cell becomes the row's declared record plane.
   *
   * Not the release plane: that is a VERB's plane, opened deliberately from the
   * trailing face, and picking a row to read it must never be one click away
   * from putting the unit back into stock.
   */
  recordPlane: {
    kind: 'navigate',
    reason:
      'A holds row is one serial unit; picking it opens /inventory?unit=<id>, the unit timeline the retired Unit cell linked per row. The release verb has its own stage-overlay plane.',
  },
};
