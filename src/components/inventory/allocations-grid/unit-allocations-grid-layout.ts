/**
 * Unit-allocations column model — MATERIALIZED from a {@link SlotLayout} onto
 * the SHARED compound skeleton, never a hand array.
 *
 * It replaced five hand-written `<th>`/`<td>` pairs inside
 * `ByUnitView.tsx` — raw HTML, so not even a second table engine's column
 * type: no header sort, no Fields picker, no org binding and no empty state.
 *
 * The skeleton mounts WHOLE — no `.filter`. Two tracks say little on this feed
 * (`select` has no bulk verb, `thumb` has no photo fact) but cutting chrome
 * geometry off a mount requires a `COMPOUND_SKELETON_FILTER_DEBT` row, and
 * that list is documented shrink-only: "do not grow this list to paint fewer
 * columns". Chrome HEADERS are family data and are relabelled to this desk's
 * vocabulary instead; the geometry is the engine's.
 *
 * Shared with the per-SKU allocations mount (a later brief) by construction:
 * everything here reads the layout it is handed, so that desk materializes its
 * own bindings off the same catalog with no edit to this file.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  UNIT_ALLOCATIONS_FIELD_CATALOG,
  UNIT_ALLOCATIONS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/unit-allocations';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type UnitAllocationsGridColumnKey =
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
 * One column of the allocations pane. EXTENDS the house model rather than
 * re-declaring it — every shared field is inherited and only `key` narrows.
 */
export interface UnitAllocationsGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: UnitAllocationsGridColumnKey;
}

/** Materialize the mounted columns from an effective layout. */
export function unitAllocationsCompoundColumnsFor(
  layout: SlotLayout,
): readonly UnitAllocationsGridColumn[] {
  const tracks = materializeTracks<UnitAllocationsGridColumn>({
    layout,
    catalog: UNIT_ALLOCATIONS_FIELD_CATALOG,
    base: compoundColumnsFor<UnitAllocationsGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = UNIT_ALLOCATIONS_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    // The title column is the UNIT under reservation, not a product.
    if (t.key === 'item') return { ...t, label: 'Unit', gridLabel: 'Unit' };
    // One temporal fact on the chrome: when the order took the unit.
    if (t.key === 'dates') return { ...t, label: 'Allocated', gridLabel: 'Allocated' };
    // The pill the retired `state` cell painted, in the pill's own track.
    if (t.key === 'state') return { ...t, label: 'State', gridLabel: 'State' };
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const UNIT_ALLOCATIONS_COMPOUND_COLUMNS: readonly UnitAllocationsGridColumn[] =
  unitAllocationsCompoundColumnsFor(UNIT_ALLOCATIONS_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Every painted DATA track answers, including the three the chrome paints:
 * a labeled header with a dead click fails `SLOT_TABLE_PAINT_LAW.headerSort`.
 * Structural chrome is named by `isSlotTableChromeTrack`, never by a hand list
 * that could drift from the law.
 */
export function unitAllocationsSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isSlotTableChromeTrack(col.key)) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'unit-allocations.order';
  if (col.key === 'item') return 'unit-allocations.unit';
  if (col.key === 'state') return 'unit-allocations.state';
  // The Dates chrome paints the allocation stamp on its Hash line, so its
  // header sorts that same fact.
  if (col.key === 'dates') return 'unit-allocations.allocated';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isUnitAllocationsColumnSortable(
  columns: readonly UnitAllocationsGridColumn[],
  key: string,
): key is UnitAllocationsGridColumnKey {
  return columns.some((c) => c.key === key && unitAllocationsSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForUnitAllocationsColumn(
  columns: readonly UnitAllocationsGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
