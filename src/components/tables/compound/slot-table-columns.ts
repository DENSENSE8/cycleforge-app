/** The COLUMN ENGINE — one materializer, one sort law, every family. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import {
  SLOT_TABLE_ID_HEADER_WORD,
  slotTableChromeField,
  slotTableIdentityField,
  type SlotTableChromeKey,
  type SlotTableFamily,
} from '@/lib/tables/slot-table-family';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { FieldDisplayType } from '@/lib/tables/field-catalog/types';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/**
 * The compound track keys, for every family. Slot tracks key by SLOT INDEX
 * (`status:1`, `subtitle:2`) and never by field id, so rebinding a slot keeps
 * the width and every staff preference pinned to that slot.
 */
export type SlotTableColumnKey =
  | 'select'
  | 'fulfillment'
  | 'thumb'
  | 'item'
  | 'dates'
  | 'state'
  | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

/** One mounted column. The house model, narrowed to the compound keys. */
export interface SlotTableColumn extends Omit<LedgerGridColumnModel, 'key'>, SlotTrackFields {
  key: SlotTableColumnKey;
}

const DATA_CHROME_KEYS: readonly SlotTableChromeKey[] = ['fulfillment', 'item', 'dates', 'state'];

function isDataChromeKey(key: string): key is SlotTableChromeKey {
  return (DATA_CHROME_KEYS as readonly string[]).includes(key);
}

/** Materialize the mounted columns for a family + an effective layout. */
export function slotTableColumnsFor(
  family: SlotTableFamily,
  layout: SlotLayout,
): readonly SlotTableColumn[] {
  const tracks = materializeTracks<SlotTableColumn>({
    layout,
    catalog: family.catalog,
    base: compoundColumnsFor<SlotTableColumn>(),
  });
  const identity = slotTableIdentityField(family, layout);

  return tracks.map((track) => {
    if (!isDataChromeKey(track.key)) return track;

    // The identity header is the LAW's word on every peer.
    if (track.key === 'fulfillment' && identity) {
      return {
        ...track,
        label: SLOT_TABLE_ID_HEADER_WORD,
        gridLabel: SLOT_TABLE_ID_HEADER_WORD,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }

    // Identity is handled above. An unresolvable identity field keeps the
    // skeleton track, whose word is already the law's.
    if (track.key === 'fulfillment') return track;
    const binding = family.chrome?.[track.key];
    if (!binding) return track;
    const label = binding.label ?? slotTableChromeField(family, track.key)?.label ?? track.label;
    return {
      ...track,
      ...(label === undefined ? {} : { label }),
      gridLabel: binding.gridLabel ?? label ?? track.gridLabel,
      ...(binding.displayType === undefined ? {} : { slotDisplayType: binding.displayType }),
      ...(binding.sortable === false ? { sortable: false as const } : {}),
    };
  });
}

/** The FACT a column sorts by, or null when it offers no sort. */
export function slotTableSortFactFor(
  family: SlotTableFamily,
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isSlotTableChromeTrack(col.key)) return null;
  if (isDataChromeKey(col.key)) return slotTableChromeField(family, col.key)?.id ?? null;
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isSlotTableColumnSortable(
  family: SlotTableFamily,
  columns: readonly SlotTableColumn[],
  key: string,
): key is SlotTableColumnKey {
  return columns.some((c) => c.key === key && slotTableSortFactFor(family, c) !== null);
}

const DESC_FIRST: readonly FieldDisplayType[] = ['date', 'money', 'number'];

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForSlotTableColumn(
  family: SlotTableFamily,
  columns: readonly SlotTableColumn[],
  key: string,
): GridSortDir {
  const col = columns.find((c) => c.key === key);
  const displayType = isDataChromeKey(key)
    ? (col?.slotDisplayType ?? slotTableChromeField(family, key)?.displayType)
    : col?.slotDisplayType;
  return displayType && DESC_FIRST.includes(displayType) ? 'desc' : 'asc';
}
