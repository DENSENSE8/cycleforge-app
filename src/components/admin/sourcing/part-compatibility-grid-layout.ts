/**
 * Part-compatibility column model — MATERIALIZED from a {@link SlotLayout}
 * onto the SHARED compound skeleton, never a hand array.
 *
 * It replaced `columns`, a component-local `AdminTableColumn[]` literal
 * carrying JSX (two two-line `<div>` stacks, a hand-rolled pill, and a
 * `<Button>` cell): a second table engine's column type, with no header sort,
 * no Fields picker and no org binding, because that engine never grew them.
 *
 * The skeleton mounts WHOLE — no `.filter`. A compatibility edge has no
 * picture, so the photo gutter paints the typed placeholder, exactly as
 * `cycle-counts` and `kiosk-slot-events` already do; filtering `thumb` off the
 * mount would need a new `COMPOUND_SKELETON_FILTER_DEBT` row and that list is
 * documented shrink-only. Chrome headers are family DATA and may be relabelled
 * (SKU · Part · Linked · Fit); a geometry cut is not.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  PART_COMPATIBILITY_FIELD_CATALOG,
  PART_COMPATIBILITY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/part-compatibility';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type PartCompatibilityGridColumnKey =
  | 'select' | 'fulfillment' | 'thumb' | 'item' | 'dates' | 'state' | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface PartCompatibilityGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>, SlotTrackFields {
  key: PartCompatibilityGridColumnKey;
}

/** Materialize the mounted columns from an effective layout. */
export function partCompatibilityCompoundColumnsFor(
  layout: SlotLayout,
): readonly PartCompatibilityGridColumn[] {
  const tracks = materializeTracks<PartCompatibilityGridColumn>({
    layout,
    catalog: PART_COMPATIBILITY_FIELD_CATALOG,
    base: compoundColumnsFor<PartCompatibilityGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = PART_COMPATIBILITY_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    // The title column is the PART — see the catalog docblock for why the part
    // is the row and the model is the line under it.
    if (t.key === 'item') return { ...t, label: 'Part', gridLabel: 'Part' };
    // One temporal fact on this desk: when the edge was linked.
    if (t.key === 'dates') return { ...t, label: 'Linked', gridLabel: 'Linked' };
    // The pill the retired `fit` cell painted — now WITHOUT the OEM prefix.
    if (t.key === 'state') return { ...t, label: 'Fit', gridLabel: 'Fit' };
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const PART_COMPATIBILITY_COMPOUND_COLUMNS: readonly PartCompatibilityGridColumn[] =
  partCompatibilityCompoundColumnsFor(PART_COMPATIBILITY_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Every painted DATA track answers here — the header-sort law. The four chrome
 * tracks that paint a fact the layout does not BIND (`fulfillment` = the SKU,
 * `item` = the part title, `dates` = the linked stamp, `state` = the fit pill)
 * map to the catalog field behind them, so the header sorts the thing the
 * operator is looking at. Structural chrome is named by
 * {@link isSlotTableChromeTrack} rather than by a hand list here, so a track
 * added to that vocabulary cannot start offering a sort on this desk.
 */
export function partCompatibilitySortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isSlotTableChromeTrack(col.key)) return null;
  if (col.key === 'fulfillment') return 'part-compatibility.sku';
  if (col.key === 'item') return 'part-compatibility.part';
  if (col.key === 'dates') return 'part-compatibility.linked';
  if (col.key === 'state') return 'part-compatibility.fit';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isPartCompatibilityColumnSortable(
  columns: readonly PartCompatibilityGridColumn[],
  key: string,
): key is PartCompatibilityGridColumnKey {
  return columns.some((c) => c.key === key && partCompatibilitySortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForPartCompatibilityColumn(
  columns: readonly PartCompatibilityGridColumn[],
  key: string,
): GridSortDir {
  // The chrome date track carries no bound field, so it has no slotDisplayType.
  if (key === 'dates') return 'desc';
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
