/**
 * `support.warranty` — Warranty-claims table definition (plan Phase 1, wave 2).
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference;
 * the shell recipe, aria name, testid and prefs bucket are the literals the
 * mount used to carry.
 */

import type { WarrantyClaimListRow } from '@/lib/warranty/types';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { WARRANTY_GRID_COLUMNS, type WarrantyGridColumn } from './warranty-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { WARRANTY_GRID_CAPABILITIES, makeWarrantyGridDescriptor } from './warranty-grid-descriptor';

export const WARRANTY_TABLE_DEFINITION = parseTableDefinition({
  id: 'support.warranty',
  tableId: 'warranty',
  entityFamily: 'warranty',
  cellMapKey: 'warranty',
  ariaLabel: 'Warranty claims',
  testId: 'warranty-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: WARRANTY_GRID_CAPABILITIES,
  columns: WARRANTY_GRID_COLUMNS,
});

export const WARRANTY_TABLE_BINDING: TableSurfaceBinding<WarrantyClaimListRow, WarrantyGridColumn> = {
  definition: WARRANTY_TABLE_DEFINITION,
  columns: WARRANTY_GRID_COLUMNS,
  makeDescriptor: makeWarrantyGridDescriptor,
  /**
   * Migrated onto `RightRailHost` 2026-08-10. It used to be a page-local
   * `w-[420px] border-l … shadow-xl` column mounted straight into
   * `WarrantyWorkspace` — the private right-edge element the right-rail store
   * exists to prevent — with an `AnimatePresence` keyed per claim (exit → empty
   * → enter on every step) and a spring `x: 420` slide on a width its siblings
   * lay out against. Declaring the plane is what surfaced it: the union has no
   * arm that can describe a private fork.
   */
  recordPlane: { kind: 'inspector', occupantId: 'detail:warranty' },
};
