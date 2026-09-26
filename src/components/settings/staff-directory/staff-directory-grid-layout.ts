/**
 * Staff-directory column model — MATERIALIZED from a {@link SlotLayout} onto
 * the SHARED compound skeleton, never a hand array.
 *
 * It replaced seven hand-written `AdminTableColumn` objects carrying JSX — a
 * second table engine's column type, with no header sort, no Fields picker and
 * no org binding, because that engine never grew them.
 *
 * The skeleton mounts WHOLE — no `.filter`. The photo gutter has no photo on a
 * staff row and paints the typed placeholder, exactly as `auth-sessions`
 * already does: `COMPOUND_SKELETON_FILTER_DEBT` is documented shrink-only, and
 * a new desk cutting chrome to taste is the fork the law names. Chrome headers
 * are RENAMED into this family's vocabulary instead (Staff # · Name · Last
 * login · Status) — a label is family data, geometry is the engine's.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  STAFF_DIRECTORY_FIELD_CATALOG,
  STAFF_DIRECTORY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/staff-directory';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type StaffDirectoryGridColumnKey =
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

export interface StaffDirectoryGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: StaffDirectoryGridColumnKey;
}

/**
 * Materialize the mounted columns from an effective layout. Tracks this family
 * has no fact for are filtered off the MOUNT — never removed from
 * `COMPOUND_TRACKS`.
 */
export function staffDirectoryCompoundColumnsFor(
  layout: SlotLayout,
): readonly StaffDirectoryGridColumn[] {
  const tracks = materializeTracks<StaffDirectoryGridColumn>({
    layout,
    catalog: STAFF_DIRECTORY_FIELD_CATALOG,
    base: compoundColumnsFor<StaffDirectoryGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = STAFF_DIRECTORY_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    // The title column is WHO the teammate is, not an item.
    if (t.key === 'item') return { ...t, label: 'Name', gridLabel: 'Name' };
    // One temporal fact on this desk: when they last signed in.
    if (t.key === 'dates') return { ...t, label: 'Last login', gridLabel: 'Last login' };
    // The pill the retired `StatusPill` cell painted, in the pill's own track.
    if (t.key === 'state') return { ...t, label: 'Status', gridLabel: 'Status' };
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const STAFF_DIRECTORY_COMPOUND_COLUMNS: readonly StaffDirectoryGridColumn[] =
  staffDirectoryCompoundColumnsFor(STAFF_DIRECTORY_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Every painted DATA track answers, including the four chrome tracks this
 * family paints facts into — a painted DATA header with a dead sort fails
 * `SLOT_TABLE_PAINT_LAW.headerSort`. Chrome that carries no fact (`select`,
 * `thumb`, `_fill`) has no `fieldId` and falls through to null.
 *
 * The STATE header sorts by `status`, the pill's primary fact, and not by the
 * derived `deactivated` word: an admin ordering the Status column is asking
 * for the lifecycle, and `active` has its own bindable fact for the other
 * question.
 */
export function staffDirectorySortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'staff-directory.staff_id';
  if (col.key === 'item') return 'staff-directory.staff';
  if (col.key === 'state') return 'staff-directory.status';
  if (col.key === 'dates') return 'staff-directory.last_login';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isStaffDirectoryColumnSortable(
  columns: readonly StaffDirectoryGridColumn[],
  key: string,
): key is StaffDirectoryGridColumnKey {
  return columns.some((c) => c.key === key && staffDirectorySortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForStaffDirectoryColumn(
  columns: readonly StaffDirectoryGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
