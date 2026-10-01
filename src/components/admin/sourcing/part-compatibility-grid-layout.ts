/** Part-compatibility column model — MATERIALIZED from a {@link DataTableColumnLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  PART_COMPATIBILITY_FIELD_CATALOG,
  PART_COMPATIBILITY_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/part-compatibility';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type PartCompatibilityGridColumnKey =
  | 'select' | 'fulfillment' | 'thumb' | 'item' | 'dates' | 'state' | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface PartCompatibilityGridColumn extends Omit<LedgerGridColumnModel, 'key'>, DataTableColumnFields { key: PartCompatibilityGridColumnKey; }

/** Materialize the mounted columns from an effective layout. */
export function partCompatibilityCompoundColumnsFor(layout: DataTableColumnLayout): readonly PartCompatibilityGridColumn[] { const tracks = materializeTracks<PartCompatibilityGridColumn>({
  layout,
  catalog: PART_COMPATIBILITY_FIELD_CATALOG,
  base: compoundColumnsFor<PartCompatibilityGridColumn>(),
});
// The identity slot IS the shared `fulfillment` chrome track. Its WORD is
// the engine's `Id` on every peer (`data-table-family.ts`); this
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
}); }

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const PART_COMPATIBILITY_COMPOUND_COLUMNS: readonly PartCompatibilityGridColumn[] =
  partCompatibilityCompoundColumnsFor(PART_COMPATIBILITY_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function partCompatibilitySortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isDataTableChromeColumn(col.key)) return null;
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
