/**
 * The COLUMN ENGINE — one materializer, one sort law, every family.
 *
 * `compound-columns.ts` owns the geometry (which tracks exist and how wide);
 * `materialize-tracks.ts` turns a {@link SlotLayout} into slot tracks. What
 * sat between them until 2026-09-15 was 41 per-family modules that each
 * re-typed the same three steps — materialize, morph the identity chrome,
 * relabel the data chrome — and then re-typed the same sort law under a
 * family-prefixed name (`skuBinsSortFactFor`, `locationStockSortFactFor`, …).
 *
 * Measured before this module existed: of the 25 families on the canonical
 * compound skeleton, EVERY delta against the raw engine output was data —
 * a label, a grid label, a sort fact, an occasional display type. 35 of them
 * carried a byte-identical `is{Family}ColumnSortable`. That is one function
 * copied 35 times, and it is why a change to the header-sort law had to be
 * applied 35 times to land.
 *
 * So the steps live here once and read their strings from a
 * {@link SlotTableFamily}. A new page stands a table up by writing that
 * record — no column module, no sort module, no second key union.
 *
 * ## The laws this module keeps
 *
 * - **Geometry is the engine's.** The skeleton mounts WHOLE; there is no
 *   `.filter` and no per-family width. A desk that wants fewer tracks hides
 *   them with LAYOUT (`COMPOUND_SKELETON_FILTER_DEBT` is the shrink-only list
 *   of the ones that predate this rule).
 * - **A painted DATA header sorts** (`SLOT_TABLE_PAINT_LAW.headerSort`).
 *   Structural chrome never does, and it is named by `isSlotTableChromeTrack`,
 *   never by a hand list that could drift.
 * - **Dates and counts read newest/highest first.** The rule reads the bound
 *   field's display type, so the `dates` chrome answers `desc` because the
 *   fact under it is a date — not because a family remembered to special-case
 *   its own key (six did; nineteen did not, and their Counted header opened
 *   oldest-first for no stated reason).
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import {
  slotTableChromeField,
  slotTableIdentityField,
  type SlotTableChromeKey,
  type SlotTableFamily,
} from '@/lib/tables/slot-table-family';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { FieldDisplayType } from '@/lib/tables/field-catalog/types';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import { SLOT_TABLE_ID_HEADER_WORD } from '@/lib/tables/slot-table-id-header-law';
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

/**
 * Materialize the mounted columns for a family + an effective layout.
 *
 * The identity chrome (`fulfillment`) takes the layout's identity field: its
 * header, its `id` face and its fact. Everything else is a relabel — the
 * fact stays in the sort map rather than on the column, because a `fieldId`
 * on a chrome track would tell the row renderer to resolve a slot value where
 * the adapter already paints a hand cell.
 */
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

    // The identity header is the LAW's word on every peer. The family still
    // supplies the FACT (which is what the cell paints and the header sorts
    // by); it supplies no word, and `SlotTableIdentityBinding` has no field
    // for one. `slot-table-id-header-law.ts`.
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

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Every painted DATA track answers — including the chrome tracks a family
 * paints facts into. Structural chrome (`select`, `thumb`, `_fill`, overflow)
 * is refused by the shared law, so a new chrome key cannot quietly become
 * sortable here.
 */
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

/**
 * Dates and counts read newest/highest first; names and ids alphabetically.
 *
 * A chrome header answers for the fact BOUND to it, not for the track's own
 * (absent) display type — "Counted" is a date column whatever the skeleton
 * calls the track.
 */
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
