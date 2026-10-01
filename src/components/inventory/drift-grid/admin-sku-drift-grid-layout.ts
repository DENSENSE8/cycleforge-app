/** SKU stock-drift column model — MATERIALIZED from a {@link DataTableColumnLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  ADMIN_SKU_DRIFT_FIELD_CATALOG,
  ADMIN_SKU_DRIFT_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/admin-sku-drift';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type AdminSkuDriftGridColumnKey =
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
 * One column of the SKU-drift desk. EXTENDS the house model rather than
 * re-declaring it — every shared field is inherited and only `key` narrows.
 */
export interface AdminSkuDriftGridColumn extends Omit<LedgerGridColumnModel, 'key'>, DataTableColumnFields { key: AdminSkuDriftGridColumnKey; }

/** Materialize the mounted columns from an effective layout. */
export function adminSkuDriftCompoundColumnsFor(layout: DataTableColumnLayout): readonly AdminSkuDriftGridColumn[] { const tracks = materializeTracks<AdminSkuDriftGridColumn>({
  layout,
  catalog: ADMIN_SKU_DRIFT_FIELD_CATALOG,
  base: compoundColumnsFor<AdminSkuDriftGridColumn>(),
});
// The identity slot IS the shared `fulfillment` chrome track. Its WORD is
// the engine's `Id` on every peer (`data-table-family.ts`); this
// family supplies only the FACT the chip paints and its header sorts by.
const identity = ADMIN_SKU_DRIFT_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
return tracks.map((t) => {
  if (t.key === 'fulfillment' && identity) {
    return {
      ...t,
      type: 'id' as const,
      fieldId: identity.id,
      slotDisplayType: identity.displayType,
    };
  }
  // The title line is the WAREHOUSE delta — the primary dimension, and the
  // fact the desk is read for.
  if (t.key === 'item') return { ...t, label: 'Δ WH', gridLabel: 'Δ WH' };
  // No temporal fact on a read-time view. See the module docblock.
  if (t.key === 'dates') return { ...t, gridLabel: '', sortable: false };
  // The pill is the BOXED delta — the second dimension, in the cell an
  // operator reads for "and what about the other counter".
  if (t.key === 'state') return { ...t, label: 'Δ Boxed', gridLabel: 'Δ Boxed' };
  return t;
}); }

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const ADMIN_SKU_DRIFT_COMPOUND_COLUMNS: readonly AdminSkuDriftGridColumn[] =
  adminSkuDriftCompoundColumnsFor(ADMIN_SKU_DRIFT_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function adminSkuDriftSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isDataTableChromeColumn(col.key)) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'admin-sku-drift.sku';
  if (col.key === 'item') return 'admin-sku-drift.warehouse_drift';
  if (col.key === 'state') return 'admin-sku-drift.boxed_drift';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isAdminSkuDriftColumnSortable(
  columns: readonly AdminSkuDriftGridColumn[],
  key: string,
): key is AdminSkuDriftGridColumnKey {
  return columns.some((c) => c.key === key && adminSkuDriftSortFactFor(c) !== null);
}

/** Counts read highest first; names and ids alphabetically. */
export function defaultDirForAdminSkuDriftColumn(
  columns: readonly AdminSkuDriftGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
