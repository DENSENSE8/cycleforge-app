/** Admin › Holds column model — MATERIALIZED from a {@link SlotLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  ADMINHOLDS_FIELD_CATALOG,
  ADMINHOLDS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/admin-holds';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type AdminHoldsGridColumnKey =
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
 * One column of the holds desk. EXTENDS the house model rather than
 * re-declaring it — every shared field is inherited and only `key` narrows.
 */
export interface AdminHoldsGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: AdminHoldsGridColumnKey;
}

/**
 * Materialize the mounted columns from an effective layout. Tracks this family
 * has no fact for are filtered off the MOUNT by the engine — never removed from
 * `COMPOUND_TRACKS`.
 */
export function adminHoldsCompoundColumnsFor(
  layout: SlotLayout,
): readonly AdminHoldsGridColumn[] {
  const tracks = materializeTracks<AdminHoldsGridColumn>({
    layout,
    catalog: ADMINHOLDS_FIELD_CATALOG,
    base: compoundColumnsFor<AdminHoldsGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = ADMINHOLDS_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    // The title line is the SERIAL — what is printed on the thing in the bin.
    // (The retired `unit` cell stacked `#id · serial` under one header; the id
    // is the handle and lives on the identity chip. See the catalog docblock.)
    if (t.key === 'item') return { ...t, label: 'Serial', gridLabel: 'Serial' };
    // One temporal fact on this desk: when the unit was quarantined.
    if (t.key === 'dates') return { ...t, label: 'Held at', gridLabel: 'Held at' };
    // The pill says where a release puts the unit back, not `ON_HOLD` — every
    // row on this feed is on hold, so that word would be a constant column.
    if (t.key === 'state') return { ...t, label: 'Restore to', gridLabel: 'Restore to' };
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const ADMINHOLDS_COMPOUND_COLUMNS: readonly AdminHoldsGridColumn[] =
  adminHoldsCompoundColumnsFor(ADMINHOLDS_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function adminHoldsSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'admin-holds.unit';
  if (col.key === 'item') return 'admin-holds.serial';
  if (col.key === 'state') return 'admin-holds.restore_status';
  // The Dates chrome paints the hold stamp, so its header sorts that fact —
  // and "what has been sitting in quarantine longest" is the first question
  // anybody brings to this desk.
  if (col.key === 'dates') return 'admin-holds.held_at';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isAdminHoldsColumnSortable(
  columns: readonly AdminHoldsGridColumn[],
  key: string,
): key is AdminHoldsGridColumnKey {
  return columns.some((c) => c.key === key && adminHoldsSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForAdminHoldsColumn(
  columns: readonly AdminHoldsGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
