/**
 * Admin drift-alert column model — MATERIALIZED from a {@link SlotLayout} onto
 * the SHARED compound skeleton, never a hand array.
 *
 * It replaced four hand-written `AdminTableColumn` objects carrying JSX — a
 * second table engine's column type, with no header sort, no Fields picker, no
 * search and no org binding, because that engine never grew them.
 *
 * The skeleton mounts WHOLE — no `.filter`. `thumb` has no photo fact on a
 * stock alert and paints the typed placeholder, exactly as `kiosk-slot-events`
 * and `audit-log` already do: `COMPOUND_SKELETON_FILTER_DEBT` is documented
 * shrink-only, and a new desk cutting chrome to taste is the fork the law
 * names. Chrome headers are RENAMED into this family's vocabulary instead
 * (SKU · Detail · Triggered · Worst |Δ|) — a label is family data, geometry is
 * the engine's.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  ADMIN_DRIFT_ALERTS_FIELD_CATALOG,
  ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/admin-drift-alerts';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type AdminDriftAlertsGridColumnKey =
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
 * One column of the drift-alerts desk. EXTENDS the house model rather than
 * re-declaring it — every shared field is inherited and only `key` narrows.
 */
export interface AdminDriftAlertsGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: AdminDriftAlertsGridColumnKey;
}

/** Materialize the mounted columns from an effective layout. */
export function adminDriftAlertsCompoundColumnsFor(
  layout: SlotLayout,
): readonly AdminDriftAlertsGridColumn[] {
  const tracks = materializeTracks<AdminDriftAlertsGridColumn>({
    layout,
    catalog: ADMIN_DRIFT_ALERTS_FIELD_CATALOG,
    base: compoundColumnsFor<AdminDriftAlertsGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = ADMIN_DRIFT_ALERTS_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    // The title line is the cron's own prose — the only fact on the row that
    // says what happened.
    if (t.key === 'item') return { ...t, label: 'Detail', gridLabel: 'Detail' };
    // One temporal fact on this desk: when the drift-check run opened the alert.
    if (t.key === 'dates') return { ...t, label: 'Triggered', gridLabel: 'Triggered' };
    // The pill is the magnitude — this desk's state is HOW FAR out of sync, not
    // a lifecycle word (the query pins `resolved_at IS NULL`, so every row is
    // open and a pill saying so would sort nothing). See the catalog docblock.
    if (t.key === 'state') return { ...t, label: 'Worst |Δ|', gridLabel: 'Worst |Δ|' };
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS: readonly AdminDriftAlertsGridColumn[] =
  adminDriftAlertsCompoundColumnsFor(ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Every painted DATA track answers, including the four chrome tracks this
 * family paints facts into — a painted DATA header with a dead sort fails
 * `SLOT_TABLE_PAINT_LAW.headerSort`. Structural chrome is named by
 * `isSlotTableChromeTrack`, never by a hand list that could drift from the law.
 */
export function adminDriftAlertsSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isSlotTableChromeTrack(col.key)) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'admin-drift-alerts.sku';
  if (col.key === 'item') return 'admin-drift-alerts.detail';
  // The Dates chrome paints the trigger stamp, so its header sorts that fact —
  // and sorting a page of alerts by when they opened is the first thing anybody
  // does with it.
  if (col.key === 'dates') return 'admin-drift-alerts.triggered';
  // The pill carries the magnitude, so its header orders the desk by severity.
  if (col.key === 'state') return 'admin-drift-alerts.worst_delta';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isAdminDriftAlertsColumnSortable(
  columns: readonly AdminDriftAlertsGridColumn[],
  key: string,
): key is AdminDriftAlertsGridColumnKey {
  return columns.some((c) => c.key === key && adminDriftAlertsSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForAdminDriftAlertsColumn(
  columns: readonly AdminDriftAlertsGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
