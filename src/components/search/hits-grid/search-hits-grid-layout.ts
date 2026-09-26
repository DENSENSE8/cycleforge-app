/** Find-plane column model — MATERIALIZED from a {@link SlotLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  SEARCH_HITS_FIELD_CATALOG,
  SEARCH_HITS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/search-hits';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type SearchHitsGridColumnKey =
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
 * One column of the find plane. EXTENDS the house model rather than
 * re-declaring it — every shared field is inherited and only `key` narrows.
 */
export interface SearchHitsGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: SearchHitsGridColumnKey;
}

/** Materialize the mounted columns from an effective layout. */
export function searchHitsCompoundColumnsFor(
  layout: SlotLayout,
): readonly SearchHitsGridColumn[] {
  const tracks = materializeTracks<SearchHitsGridColumn>({
    layout,
    catalog: SEARCH_HITS_FIELD_CATALOG,
    base: compoundColumnsFor<SearchHitsGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = SEARCH_HITS_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    // The title cell is WHAT the record is. "Item" is the Orders word and a
    // find hit may be a repair or an FBA shipment, so this plane says
    // Description — which is also the word the operator's brief used.
    if (t.key === 'item') return { ...t, label: 'Description', gridLabel: 'Description' };
    // One temporal fact on a find plane: when the record last moved.
    if (t.key === 'dates') return { ...t, label: 'When', gridLabel: 'When' };
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const SEARCH_HITS_COMPOUND_COLUMNS: readonly SearchHitsGridColumn[] =
  searchHitsCompoundColumnsFor(SEARCH_HITS_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function searchHitsSortFactFor(col: {
  key: string;
  fieldId?: string;
  sortable?: boolean;
}): string | null {
  if (col.sortable === false) return null;
  if (isSlotTableChromeTrack(col.key)) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'search-hits.identifier';
  if (col.key === 'item') return 'search-hits.description';
  if (col.key === 'state') return 'search-hits.status';
  // The Dates chrome paints the find stamp, so its header sorts that fact —
  // "which of these matched something that moved today" is the question the
  // column exists for.
  if (col.key === 'dates') return 'search-hits.when';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isSearchHitsColumnSortable(
  columns: readonly SearchHitsGridColumn[],
  key: string,
): key is SearchHitsGridColumnKey {
  return columns.some((c) => c.key === key && searchHitsSortFactFor(c) !== null);
}

/** Dates read newest first; ids, words and descriptions alphabetically. */
export function defaultDirForSearchHitsColumn(
  columns: readonly SearchHitsGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
