/**
 * `unit-tsn-links.unit` — the v1 TSN cross-reference table definition,
 * capabilities and surface descriptor.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference,
 * and the canonical columns are the product-default MATERIALIZATION
 * (`UNIT_TSN_LINKS_COMPOUND_COLUMNS`), never a hand array.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { UnitTsnLinkTableRow } from '@/lib/inventory/tsn-link-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  UNIT_TSN_LINKS_COMPOUND_COLUMNS,
  defaultDirForUnitTsnLinksColumn,
  isUnitTsnLinksColumnSortable,
  type UnitTsnLinksGridColumn,
} from './unit-tsn-links-grid-layout';

/**
 * A legacy READ ledger — the `kiosk-slot-events` shape. Nothing in this app
 * writes `tech_serial_numbers` any more, so there is no verb and never will
 * be, and `multiSelect` stays off: the gutter checkbox would be a control with
 * no verb behind it.
 */
export const UNIT_TSN_LINKS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render. `columns` is REQUIRED: a module-constant default is the
 * `grid-default` debt the discover scanner deletes.
 */
export function makeUnitTsnLinksGridDescriptor(
  columns: readonly UnitTsnLinksGridColumn[],
): GridSurfaceDescriptor<UnitTsnLinkTableRow, UnitTsnLinksGridColumn> {
  return makeGridSurfaceDescriptor<UnitTsnLinkTableRow, UnitTsnLinksGridColumn>(
    'unit-tsn-links.unit',
    columns,
    {
      isSortable: (key) => isUnitTsnLinksColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForUnitTsnLinksColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    UNIT_TSN_LINKS_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
export const UNIT_TSN_LINKS_TABLE_DEFINITION = parseTableDefinition({
  id: 'unit-tsn-links.unit',
  tableId: 'unit-tsn-links',
  entityFamily: 'unit-tsn-links',
  cellMapKey: 'unit-tsn-links',
  ariaLabel: 'Tech serial number links',
  testId: 'unit-tsn-links-grid-body',
  surface: 'sheet',
  // A unit has a handful of v1 records; a sticky day band per record would be
  // one band per row.
  showDayHeaders: false,
  capabilities: UNIT_TSN_LINKS_GRID_CAPABILITIES,
  columns: UNIT_TSN_LINKS_COMPOUND_COLUMNS,
});

export const UNIT_TSN_LINKS_TABLE_BINDING: TableSurfaceBinding<
  UnitTsnLinkTableRow,
  UnitTsnLinksGridColumn
> = {
  definition: UNIT_TSN_LINKS_TABLE_DEFINITION,
  columns: UNIT_TSN_LINKS_COMPOUND_COLUMNS,
  makeDescriptor: makeUnitTsnLinksGridDescriptor,
  /**
   * HONEST ABSENCE, ruled rather than defaulted. A `tech_serial_numbers` row
   * has no record surface in this app and must not grow one: the desk's own
   * header says what it is for — "helpful when joining v1 tech-station logs to
   * v2 lifecycle" — so the row is a REFERENCE an operator reads and copies,
   * and every fact it carries is already on the row. The shipment id is the
   * one id that points somewhere, and it is a bound track, not the row's
   * subject.
   */
  recordPlane: {
    kind: 'none',
    reason:
      'A v1 audit cross-reference. tech_serial_numbers has no record surface in this app and the row carries every fact it has; picking one has nothing to open.',
  },
};
