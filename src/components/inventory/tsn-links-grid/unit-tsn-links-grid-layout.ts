/** Unit-TSN-links column model — MATERIALIZED from a {@link SlotLayout} onto the SHARED compound skeleton, never a hand array. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  UNIT_TSN_LINKS_FIELD_CATALOG,
  UNIT_TSN_LINKS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/unit-tsn-links';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type UnitTsnLinksGridColumnKey =
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
 * One column of the TSN-links pane. EXTENDS the house model rather than
 * re-declaring it — every shared field is inherited and only `key` narrows.
 */
export interface UnitTsnLinksGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: UnitTsnLinksGridColumnKey;
}

/** Materialize the mounted columns from an effective layout. */
export function unitTsnLinksCompoundColumnsFor(
  layout: SlotLayout,
): readonly UnitTsnLinksGridColumn[] {
  const tracks = materializeTracks<UnitTsnLinksGridColumn>({
    layout,
    catalog: UNIT_TSN_LINKS_FIELD_CATALOG,
    base: compoundColumnsFor<UnitTsnLinksGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = UNIT_TSN_LINKS_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    // The title column is WHERE the v1 record was written.
    if (t.key === 'item') return { ...t, label: 'Station', gridLabel: 'Station' };
    // One temporal fact on this feed: when v1 wrote the serial down.
    if (t.key === 'dates') return { ...t, label: 'When', gridLabel: 'When' };
    // The pill the retired `serial_type` cell painted, in the pill's own track.
    if (t.key === 'state') return { ...t, label: 'Type', gridLabel: 'Type' };
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const UNIT_TSN_LINKS_COMPOUND_COLUMNS: readonly UnitTsnLinksGridColumn[] =
  unitTsnLinksCompoundColumnsFor(UNIT_TSN_LINKS_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or null when it offers no sort. */
export function unitTsnLinksSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isSlotTableChromeTrack(col.key)) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'unit-tsn-links.tsn';
  if (col.key === 'item') return 'unit-tsn-links.station';
  if (col.key === 'state') return 'unit-tsn-links.serial_type';
  // The Dates chrome paints the creation stamp on its Hash line.
  if (col.key === 'dates') return 'unit-tsn-links.created';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isUnitTsnLinksColumnSortable(
  columns: readonly UnitTsnLinksGridColumn[],
  key: string,
): key is UnitTsnLinksGridColumnKey {
  return columns.some((c) => c.key === key && unitTsnLinksSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForUnitTsnLinksColumn(
  columns: readonly UnitTsnLinksGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
