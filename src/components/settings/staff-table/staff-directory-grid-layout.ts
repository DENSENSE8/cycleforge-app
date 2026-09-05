/**
 * Team column model — MATERIALIZED from a {@link SlotLayout} onto the
 * SHARED compound skeleton, never a hand array.
 *
 * It replaced hand-written `AdminTableColumn` objects carrying JSX — a second
 * table engine's column type, with no header sort, no Fields picker and no org
 * binding, because that engine never grew them.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  STAFFDIRECTORY_FIELD_CATALOG,
  STAFFDIRECTORY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/staff-directory';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type StaffDirectoryGridColumnKey =
  | 'select' | 'fulfillment' | 'thumb' | 'item' | 'dates' | 'state' | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface StaffDirectoryGridColumn extends Omit<LedgerGridColumnModel, 'key'>, SlotTrackFields {
  key: StaffDirectoryGridColumnKey;
}

/**
 * Materialize the mounted columns from an effective layout. Tracks this family
 * has no fact for are filtered off the MOUNT — never removed from
 * `COMPOUND_TRACKS`.
 */
export function staffDirectoryCompoundColumnsFor(layout: SlotLayout): readonly StaffDirectoryGridColumn[] {
  const base = compoundColumnsFor<StaffDirectoryGridColumn>().filter((c) => c.key !== 'dates' && c.key !== 'select');
  return materializeTracks<StaffDirectoryGridColumn>({
    layout,
    catalog: STAFFDIRECTORY_FIELD_CATALOG,
    base,
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const STAFFDIRECTORY_COMPOUND_COLUMNS: readonly StaffDirectoryGridColumn[] =
  staffDirectoryCompoundColumnsFor(STAFFDIRECTORY_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort. Chrome tracks
 * carry no `fieldId` and fall through to null, which is what keeps them out of
 * the header-sort law.
 */
export function staffDirectorySortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'staff-directory.id';
  if (col.key === 'item') return 'staff-directory.name';
  if (col.key === 'state') return 'staff-directory.status';
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
