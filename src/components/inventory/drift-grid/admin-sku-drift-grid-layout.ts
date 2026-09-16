/**
 * SKU stock-drift column model — MATERIALIZED from a {@link SlotLayout} onto
 * the SHARED compound skeleton, never a hand array.
 *
 * It replaced seven hand-written `AdminTableColumn` objects carrying JSX — a
 * second table engine's column type, with no header sort, no Fields picker, no
 * search and no org binding, because that engine never grew them.
 *
 * The skeleton mounts WHOLE — no `.filter`. `COMPOUND_SKELETON_FILTER_DEBT` is
 * documented shrink-only, so chrome HEADERS are relabelled into this family's
 * vocabulary (SKU · Δ WH · Δ Boxed) and the geometry stays the engine's.
 *
 * ## The `dates` track mounts FACT-FREE, and that is the ruling
 *
 * `v_sku_stock_drift` is a join computed at read time — no `created_at`, no
 * `detected_at`, no stamp of any kind. So the track keeps its geometry (the
 * skeleton is never cut) and declares what it is: `gridLabel: ''` — *print
 * nothing here*, the same instruction `select` and `_fill` carry — plus
 * `sortable: false`, because a labelled header with a dead click is what
 * `SLOT_TABLE_PAINT_LAW.headerSort` forbids and this one has no fact to offer.
 * The cell paints the honest empty date face, exactly as `thumb` paints the
 * typed placeholder on every photo-less family. Inventing a stamp to fill it
 * would be a fact this feed does not have.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  ADMIN_SKU_DRIFT_FIELD_CATALOG,
  ADMIN_SKU_DRIFT_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/admin-sku-drift';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
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
export interface AdminSkuDriftGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: AdminSkuDriftGridColumnKey;
}

/** Materialize the mounted columns from an effective layout. */
export function adminSkuDriftCompoundColumnsFor(
  layout: SlotLayout,
): readonly AdminSkuDriftGridColumn[] {
  const tracks = materializeTracks<AdminSkuDriftGridColumn>({
    layout,
    catalog: ADMIN_SKU_DRIFT_FIELD_CATALOG,
    base: compoundColumnsFor<AdminSkuDriftGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-id-header-law.ts`); this
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
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const ADMIN_SKU_DRIFT_COMPOUND_COLUMNS: readonly AdminSkuDriftGridColumn[] =
  adminSkuDriftCompoundColumnsFor(ADMIN_SKU_DRIFT_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Every painted DATA track answers, including the three chrome tracks this
 * family paints facts into — a painted DATA header with a dead sort fails
 * `SLOT_TABLE_PAINT_LAW.headerSort`. Structural chrome is named by
 * `isSlotTableChromeTrack`, never by a hand list that could drift from the law;
 * the fact-free `dates` track refuses through its own `sortable: false`.
 */
export function adminSkuDriftSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isSlotTableChromeTrack(col.key)) return null;
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
