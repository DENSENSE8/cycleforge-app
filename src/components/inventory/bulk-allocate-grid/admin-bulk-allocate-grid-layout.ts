/** Bulk-allocate column model — MATERIALIZED from a {@link DataTableColumnLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  ADMIN_BULK_ALLOCATE_FIELD_CATALOG,
  ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/admin-bulk-allocate';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type AdminBulkAllocateGridColumnKey =
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

export interface AdminBulkAllocateGridColumn extends Omit<LedgerGridColumnModel, 'key'>, DataTableColumnFields { key: AdminBulkAllocateGridColumnKey; }

/** Materialize the mounted columns from an effective layout. */
export function adminBulkAllocateCompoundColumnsFor(layout: DataTableColumnLayout): readonly AdminBulkAllocateGridColumn[] { const tracks = materializeTracks<AdminBulkAllocateGridColumn>({
  layout,
  catalog: ADMIN_BULK_ALLOCATE_FIELD_CATALOG,
  base: compoundColumnsFor<AdminBulkAllocateGridColumn>(),
});
// The identity slot IS the shared `fulfillment` chrome track. Its WORD is
// the engine's `Id` on every peer (`data-table-family.ts`); this
// family supplies only the FACT the chip paints and its header sorts by.
const identity = ADMIN_BULK_ALLOCATE_FIELD_CATALOG.find(
  (f) => f.id === layout.identityFieldId,
);
return tracks.map((t) => {
  if (t.key === 'fulfillment' && identity) {
    return {
      ...t,
      type: 'id' as const,
      fieldId: identity.id,
      slotDisplayType: identity.displayType,
    };
  }
  // A candidate row has no product title — the SKU is what the thing IS.
  if (t.key === 'item') return { ...t, label: 'SKU', gridLabel: 'SKU' };
  // One temporal fact on this desk: when the order was placed.
  if (t.key === 'dates') return { ...t, label: 'Ordered', gridLabel: 'Ordered' };
  // The pill that replaced the tri-coloured availability cell's ink.
  if (t.key === 'state') return { ...t, label: 'Allocatable', gridLabel: 'Allocatable' };
  return t;
}); }

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS: readonly AdminBulkAllocateGridColumn[] =
  adminBulkAllocateCompoundColumnsFor(ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function adminBulkAllocateSortFactFor(col: {
  key: string;
  fieldId?: string;
  sortable?: boolean;
}): string | null {
  if (col.sortable === false) return null;
  if (isDataTableChromeColumn(col.key)) return null;
  if (col.key === 'fulfillment') return 'admin-bulk-allocate.order_id';
  if (col.key === 'item') return 'admin-bulk-allocate.sku';
  if (col.key === 'dates') return 'admin-bulk-allocate.ordered';
  if (col.key === 'state') return 'admin-bulk-allocate.eligible';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isAdminBulkAllocateColumnSortable(
  columns: readonly AdminBulkAllocateGridColumn[],
  key: string,
): key is AdminBulkAllocateGridColumnKey {
  return columns.some((c) => c.key === key && adminBulkAllocateSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForAdminBulkAllocateColumn(
  columns: readonly AdminBulkAllocateGridColumn[],
  key: string,
): GridSortDir {
  // The chrome date track carries no bound field, so it has no slotDisplayType.
  if (key === 'dates') return 'desc';
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
