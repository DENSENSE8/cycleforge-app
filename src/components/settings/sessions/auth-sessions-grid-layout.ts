/** Auth-sessions column model — MATERIALIZED from a {@link DataTableColumnLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  AUTHSESSIONS_FIELD_CATALOG,
  AUTHSESSIONS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/auth-sessions';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type AuthSessionsGridColumnKey =
  | 'select' | 'fulfillment' | 'thumb' | 'item' | 'dates' | 'state' | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface AuthSessionsGridColumn extends Omit<LedgerGridColumnModel, 'key'>, DataTableColumnFields { key: AuthSessionsGridColumnKey; }

/**
 * Materialize the mounted columns from an effective layout. Tracks this family
 * has no fact for are filtered off the MOUNT — never removed from
 * `COMPOUND_TRACKS`.
 */
export function authSessionsCompoundColumnsFor(layout: DataTableColumnLayout): readonly AuthSessionsGridColumn[] { const tracks = materializeTracks<AuthSessionsGridColumn>({
  layout,
  catalog: AUTHSESSIONS_FIELD_CATALOG,
  base: compoundColumnsFor<AuthSessionsGridColumn>(),
});
// The identity slot IS the shared `fulfillment` chrome track. Its WORD is
// the engine's `Id` on every peer (`data-table-family.ts`); this
// family supplies only the FACT the chip paints and its header sorts by.
const identity = AUTHSESSIONS_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
return tracks.map((t) => {
  if (t.key === 'fulfillment' && identity) {
    return {
      ...t,
      type: 'id' as const,
      fieldId: identity.id,
      slotDisplayType: identity.displayType,
    };
  }
  // The title column is WHO is signed in, not an item.
  if (t.key === 'item') return { ...t, label: 'Staff', gridLabel: 'Staff' };
  // One temporal fact on this desk: when the session was last used.
  if (t.key === 'dates') return { ...t, label: 'Last activity', gridLabel: 'Activity' };
  // The pill the old `device` cell painted, in the pill's own track.
  if (t.key === 'state') return { ...t, label: 'Device', gridLabel: 'Device' };
  return t;
}); }

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const AUTHSESSIONS_COMPOUND_COLUMNS: readonly AuthSessionsGridColumn[] =
  authSessionsCompoundColumnsFor(AUTHSESSIONS_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort. Chrome tracks
 * carry no `fieldId` and fall through to null, which is what keeps them out of
 * the header-sort law.
 */
export function authSessionsSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'auth-sessions.session';
  if (col.key === 'item') return 'auth-sessions.staff';
  if (col.key === 'state') return 'auth-sessions.device_kind';
  if (col.key === 'dates') return 'auth-sessions.last_activity';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isAuthSessionsColumnSortable(
  columns: readonly AuthSessionsGridColumn[],
  key: string,
): key is AuthSessionsGridColumnKey {
  return columns.some((c) => c.key === key && authSessionsSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForAuthSessionsColumn(
  columns: readonly AuthSessionsGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
