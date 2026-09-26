/** Cycle-counts column model — MATERIALIZED from a {@link SlotLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  CYCLECOUNTS_FIELD_CATALOG,
  CYCLECOUNTS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/cycle-counts';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type CycleCountsGridColumnKey =
  | 'select' | 'fulfillment' | 'thumb' | 'item' | 'dates' | 'state' | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface CycleCountsGridColumn extends Omit<LedgerGridColumnModel, 'key'>, SlotTrackFields {
  key: CycleCountsGridColumnKey;
}

/** Materialize the mounted columns from an effective layout. */
export function cycleCountsCompoundColumnsFor(layout: SlotLayout): readonly CycleCountsGridColumn[] {
  const tracks = materializeTracks<CycleCountsGridColumn>({
    layout,
    catalog: CYCLECOUNTS_FIELD_CATALOG,
    base: compoundColumnsFor<CycleCountsGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = CYCLECOUNTS_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    if (t.key === 'dates') {
      return { ...t, label: 'Created', gridLabel: 'Created' };
    }
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const CYCLECOUNTS_COMPOUND_COLUMNS: readonly CycleCountsGridColumn[] =
  cycleCountsCompoundColumnsFor(CYCLECOUNTS_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function cycleCountsSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (col.key === 'fulfillment') return 'cycle-counts.id';
  if (col.key === 'item') return 'cycle-counts.name';
  if (col.key === 'dates') return 'cycle-counts.created';
  if (col.key === 'state') return 'cycle-counts.status';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isCycleCountsColumnSortable(
  columns: readonly CycleCountsGridColumn[],
  key: string,
): key is CycleCountsGridColumnKey {
  return columns.some((c) => c.key === key && cycleCountsSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForCycleCountsColumn(
  columns: readonly CycleCountsGridColumn[],
  key: string,
): GridSortDir {
  // The chrome date track carries no bound field, so it has no slotDisplayType.
  if (key === 'dates') return 'desc';
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
