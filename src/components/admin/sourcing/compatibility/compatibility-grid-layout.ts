/**
 * Compatibility rules column model — MATERIALIZED from a {@link SlotLayout} onto the
 * SHARED compound skeleton, never a hand array.
 *
 * It replaced hand-written `AdminTableColumn` objects carrying JSX — a second
 * table engine's column type, with no header sort, no Fields picker and no org
 * binding, because that engine never grew them.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  COMPATIBILITY_FIELD_CATALOG,
  COMPATIBILITY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/compatibility';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type CompatibilityGridColumnKey =
  | 'select' | 'fulfillment' | 'thumb' | 'item' | 'dates' | 'state' | 'amount' | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface CompatibilityGridColumn extends Omit<LedgerGridColumnModel, 'key'>, SlotTrackFields {
  key: CompatibilityGridColumnKey;
}

/**
 * Materialize the mounted columns from an effective layout. Tracks this family
 * has no fact for are filtered off the MOUNT — never removed from
 * `COMPOUND_TRACKS`.
 */
export function compatibilityCompoundColumnsFor(layout: SlotLayout): readonly CompatibilityGridColumn[] {
  const base = compoundColumnsFor<CompatibilityGridColumn>().filter((c) => c.key !== 'dates' && c.key !== 'select' && c.key !== 'thumb');
  return materializeTracks<CompatibilityGridColumn>({
    layout,
    catalog: COMPATIBILITY_FIELD_CATALOG,
    base,
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const COMPATIBILITY_COMPOUND_COLUMNS: readonly CompatibilityGridColumn[] =
  compatibilityCompoundColumnsFor(COMPATIBILITY_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort. Chrome tracks
 * carry no `fieldId` and fall through to null, which is what keeps them out of
 * the header-sort law.
 */
export function compatibilitySortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'compatibility.id';
  if (col.key === 'item') return 'compatibility.part';
  if (col.key === 'state') return 'compatibility.kind';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isCompatibilityColumnSortable(
  columns: readonly CompatibilityGridColumn[],
  key: string,
): key is CompatibilityGridColumnKey {
  return columns.some((c) => c.key === key && compatibilitySortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForCompatibilityColumn(
  columns: readonly CompatibilityGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
