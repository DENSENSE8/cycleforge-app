/** Cycle-count LINES column model — MATERIALIZED from a {@link SlotLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  CYCLECOUNTLINES_FIELD_CATALOG,
  CYCLECOUNTLINES_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/cycle-count-lines';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type CycleCountLinesGridColumnKey =
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

export interface CycleCountLinesGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: CycleCountLinesGridColumnKey;
}

/** Materialize the mounted columns from an effective layout. */
export function cycleCountLinesCompoundColumnsFor(
  layout: SlotLayout,
): readonly CycleCountLinesGridColumn[] {
  const tracks = materializeTracks<CycleCountLinesGridColumn>({
    layout,
    catalog: CYCLECOUNTLINES_FIELD_CATALOG,
    base: compoundColumnsFor<CycleCountLinesGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = CYCLECOUNTLINES_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    // The title line is WHAT was counted.
    if (t.key === 'item') return { ...t, label: 'SKU', gridLabel: 'SKU' };
    // Two temporal facts ride this track (counted on the Hash line, decided on
    // the Calendar line). The header names the one its click sorts.
    if (t.key === 'dates') return { ...t, label: 'Counted at', gridLabel: 'Counted at' };
    // `state`'s skeleton label is already `Status`, which is the retired
    // header's word — relabelling it would be a no-op fork.
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const CYCLECOUNTLINES_COMPOUND_COLUMNS: readonly CycleCountLinesGridColumn[] =
  cycleCountLinesCompoundColumnsFor(CYCLECOUNTLINES_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function cycleCountLinesSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'cycle-count-lines.bin';
  if (col.key === 'item') return 'cycle-count-lines.sku';
  if (col.key === 'dates') return 'cycle-count-lines.counted_at';
  if (col.key === 'state') return 'cycle-count-lines.status';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isCycleCountLinesColumnSortable(
  columns: readonly CycleCountLinesGridColumn[],
  key: string,
): key is CycleCountLinesGridColumnKey {
  return columns.some((c) => c.key === key && cycleCountLinesSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForCycleCountLinesColumn(
  columns: readonly CycleCountLinesGridColumn[],
  key: string,
): GridSortDir {
  // The chrome date track carries no bound field, so it has no slotDisplayType.
  if (key === 'dates') return 'desc';
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
