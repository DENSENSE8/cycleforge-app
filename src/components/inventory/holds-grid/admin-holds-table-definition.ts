/** `admin-holds.held` — the Holds desk table definition, capabilities and surface descriptor. */

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

/** `inCellEdit: false` — the point of the port. */
export const ADMINHOLDS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/** Build the descriptor from a RESOLVED column list (post-visibility), so the TanStack defs follow the tracks that actually render. */
function makeAdminHoldsGridDescriptor(
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
const ADMINHOLDS_TABLE_DEFINITION = parseTableDefinition({
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
  /** The row IS a unit, and the retired `unit` cell linked every one of them to `/inventory?unit=<id>` — the unit's own page, where the hold… */
  recordPlane: {
    kind: 'navigate',
    reason:
      'A holds row is one serial unit; picking it opens /inventory?unit=<id>, the unit timeline the retired Unit cell linked per row. The release verb has its own stage-overlay plane.',
  },
};
