/**
 * Active sessions column model — MATERIALIZED from a {@link SlotLayout} onto the
 * SHARED compound skeleton, never a hand array.
 *
 * It replaced hand-written `AdminTableColumn` objects carrying JSX — a second
 * table engine's column type, with no header sort, no Fields picker and no org
 * binding, because that engine never grew them.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  AUTHSESSIONS_FIELD_CATALOG,
  AUTHSESSIONS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/auth-sessions';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type AuthSessionsGridColumnKey =
  | 'select' | 'fulfillment' | 'thumb' | 'item' | 'dates' | 'state' | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface AuthSessionsGridColumn extends Omit<LedgerGridColumnModel, 'key'>, SlotTrackFields {
  key: AuthSessionsGridColumnKey;
}

/**
 * Materialize the mounted columns from an effective layout. Tracks this family
 * has no fact for are filtered off the MOUNT — never removed from
 * `COMPOUND_TRACKS`.
 */
export function authSessionsCompoundColumnsFor(layout: SlotLayout): readonly AuthSessionsGridColumn[] {
  const base = compoundColumnsFor<AuthSessionsGridColumn>().filter((c) => c.key !== 'dates' && c.key !== 'select' && c.key !== 'thumb');
  return materializeTracks<AuthSessionsGridColumn>({
    layout,
    catalog: AUTHSESSIONS_FIELD_CATALOG,
    base,
  });
}

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
  if (col.key === 'fulfillment') return 'auth-sessions.sid';
  if (col.key === 'item') return 'auth-sessions.staff';
  if (col.key === 'state') return 'auth-sessions.device_kind';
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
