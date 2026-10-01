/** Admin › Returns column model — MATERIALIZED from a {@link DataTableColumnLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  ADMIN_RETURNS_FIELD_CATALOG,
  ADMIN_RETURNS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/admin-returns';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type AdminReturnsGridColumnKey =
  /** Shared compound chrome tracks — see `COMPOUND_COLUMN_KEYS`. */
  | 'select'
  | 'fulfillment'
  | 'thumb'
  | 'item'
  | 'dates'
  | 'state'
  | '_fill'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

/**
 * One column of the returns dock. EXTENDS the house model rather than
 * re-declaring it — every shared field is inherited and only `key` narrows.
 */
export interface AdminReturnsGridColumn extends Omit<LedgerGridColumnModel, 'key'>, DataTableColumnFields { key: AdminReturnsGridColumnKey; }

/** Materialize the mounted columns from an effective layout. */
export function adminReturnsCompoundColumnsFor(layout: DataTableColumnLayout): readonly AdminReturnsGridColumn[] { const tracks = materializeTracks<AdminReturnsGridColumn>({
  layout,
  catalog: ADMIN_RETURNS_FIELD_CATALOG,
  base: compoundColumnsFor<AdminReturnsGridColumn>(),
});
// The identity slot IS the shared `fulfillment` chrome track. Its WORD is
// the engine's `Id` on every peer (`data-table-family.ts`); this
// family supplies only the FACT the chip paints and its header sorts by.
const identity = ADMIN_RETURNS_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
return tracks.map((t) => {
  if (t.key === 'fulfillment' && identity) {
    return {
      ...t,
      type: 'id' as const,
      fieldId: identity.id,
      slotDisplayType: identity.displayType,
    };
  }
  return t;
}); }

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const ADMIN_RETURNS_COMPOUND_COLUMNS: readonly AdminReturnsGridColumn[] =
  adminReturnsCompoundColumnsFor(ADMIN_RETURNS_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function adminReturnsSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'admin-returns.unit';
  if (col.key === 'item') return 'inventory-events.sku';
  if (col.key === 'state') return 'inventory-events.status_change';
  // The Dates chrome paints the occurred stamp on its Hash line, so its header
  // sorts the same fact the bound `occurred` track does — a painted DATA track
  // with a dead header fails DATA_TABLE_PAINT_LAW.headerSort.
  if (col.key === 'dates') return 'inventory-events.occurred';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isAdminReturnsColumnSortable(
  columns: readonly AdminReturnsGridColumn[],
  key: string,
): key is AdminReturnsGridColumnKey {
  return columns.some((c) => c.key === key && adminReturnsSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForAdminReturnsColumn(
  columns: readonly AdminReturnsGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
