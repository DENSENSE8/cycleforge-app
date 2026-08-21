/**
 * The compound row's COLUMN model — one declaration, every family.
 *
 * ## Why this file exists
 *
 * Receiving and Orders each carried a hand-copied compound column array, and a
 * unit test asserted the two stayed byte-identical. That test is the tell: when
 * the only thing keeping two declarations equal is an assertion, the
 * declarations are already a fork — the test just converts the drift from a
 * silent visual bug into a red build, days after someone edited one of them.
 *
 * So the arrays are now DERIVED. {@link COMPOUND_TRACKS} is the single
 * geometry declaration; a family calls {@link compoundColumnsFor} and gets its
 * own typed array back. Identical keys, widths and order are now a property of
 * construction, not of a promise. The shared-not-forked test still runs, but it
 * now pins a fact rather than policing a copy.
 *
 * ## What a family may and may not vary
 *
 * A family supplies its column TYPE (so `ReceivingGridColumn` stays
 * `ReceivingGridColumnKey`-narrowed) and nothing else. There is deliberately no
 * per-family width/label override hook: the goal is that any visual difference
 * between two compound tables is a DATA difference, and an override parameter
 * is precisely the door through which a layout difference walks back in.
 *
 * If a track genuinely needs to change, it changes HERE, for everyone, in one
 * edit — which is the whole point.
 *
 * ## Operator resize
 *
 * Every content track is `resizable: true`. The engine already owns the
 * mechanics (drag handle in `LedgerGridColumnHeader`, `--cf-col-*` vars written
 * by `ColumnResizeHandle`, per-staff persistence via `useGridColumnWidths`), so
 * this is a flag, not a feature build. Only `select` (a 2rem checkbox gutter),
 * `open` (a 2.5rem chevron) and `_fill` (structural slack) stay fixed: their
 * contents have no variable length, so a drag there could only add or steal
 * whitespace around a glyph.
 *
 * The widths below are DEFAULTS, not a ceiling. `fulfillment` used to be 11rem,
 * which left a visible gutter between a short order chip and the item title on
 * every row; it is 8.5rem now and an operator who works long PO numbers drags
 * it wider once and it sticks.
 */

import { GRID_FILL_COLUMN } from '@/design-system/components/grid';
import type { ColumnType } from '@/lib/tables/table-columns';
import { COMPOUND_ROW_PX, COMPOUND_THUMB_TRACK_REM } from './compound-row-chrome';

/**
 * The compound track keys, in canonical order.
 *
 * HARD RULE — image · ids · title · status · open. The photo is leftmost
 * because it is what an operator's eye lands on when scanning a shelf list
 * against a physical box.
 */
export const COMPOUND_COLUMN_KEYS = [
  'select',
  'thumb',
  'fulfillment',
  'item',
  'state',
  'open',
  '_fill',
] as const;

export type CompoundColumnKey = (typeof COMPOUND_COLUMN_KEYS)[number];

/**
 * Structural shape of one compound track.
 *
 * Deliberately structural rather than the concrete `LedgerGridColumnModel`:
 * every family's column interface satisfies it, and typing against the
 * descriptor module would drag a heavier import into what must stay a leaf.
 */
export interface CompoundTrack {
  key: CompoundColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  align?: 'start' | 'end';
  frozen?: boolean;
  sortable?: boolean;
  resizable?: boolean;
  minTrackRem?: number;
  hideKey?: string;
}

/**
 * The ONE compound geometry declaration.
 *
 * | track         | width  | resize | carries                              |
 * |---------------|--------|--------|--------------------------------------|
 * | `select`      | 2rem   | no     | frozen checkbox gutter               |
 * | `thumb`       | 4rem   | yes    | square photo (frozen row handle)     |
 * | `fulfillment` | 8.5rem | yes    | order / PO over carrier tracking     |
 * | `item`        | 18rem  | yes    | title over the operator note         |
 * | `state`       | 10rem  | yes    | state pill over lateness             |
 * | `open`        | 2.5rem | no     | chevron → the record                 |
 * | `_fill`       | 1fr    | no     | sole slack track                     |
 *
 * The frozen pane is `select · thumb` — a contiguous prefix, because
 * `gridFrozenLeft` sums the widths of preceding frozen tracks and a gap would
 * pin the sticky pane at the wrong origin. The thumbnail resizes safely inside
 * that pane: those offsets are a `calc()` over the same `--cf-col-*` vars the
 * drag writes, so pinned cells follow a resized track with no extra machinery.
 */
export const COMPOUND_TRACKS: readonly CompoundTrack[] = [
  {
    key: 'select',
    width: 'minmax(2rem, 2rem)',
    sortable: false,
    frozen: true,
    resizable: false,
  },
  {
    key: 'thumb',
    frozen: true,
    width: `minmax(${COMPOUND_THUMB_TRACK_REM}rem, ${COMPOUND_THUMB_TRACK_REM}rem)`,
    label: 'Photo',
    // Empty grid label: the column is a 32px square with no room for a word,
    // and the thumbnails themselves say what the track is.
    gridLabel: '',
    align: 'start',
    sortable: false,
    resizable: true,
    minTrackRem: 2.5,
    labelFitRem: 2,
  },
  {
    key: 'fulfillment',
    // 8.5rem fits `#`-less order chips and a last-8 tracking face with a hair
    // of slack. Wider read as a gap between two columns rather than as one
    // column with breathing room.
    width: 'minmax(8.5rem, 8.5rem)',
    label: 'Fulfillment',
    gridLabel: 'Order',
    type: 'id',
    align: 'start',
    hideKey: 'tracking',
    resizable: true,
    minTrackRem: 6,
    labelFitRem: 5,
  },
  {
    key: 'item',
    width: 'minmax(18rem, 18rem)',
    label: 'Item',
    gridLabel: 'Item',
    type: 'text',
    align: 'start',
    resizable: true,
    minTrackRem: 10,
    labelFitRem: 6,
  },
  {
    key: 'state',
    width: 'minmax(10rem, 10rem)',
    label: 'Status',
    gridLabel: 'Status',
    type: 'tag',
    align: 'start',
    hideKey: 'status',
    resizable: true,
    minTrackRem: 7,
    labelFitRem: 5,
  },
  {
    key: 'open',
    width: 'minmax(2.5rem, 2.5rem)',
    label: 'Open',
    gridLabel: '',
    align: 'end',
    sortable: false,
    resizable: false,
    labelFitRem: 2,
  },
  { ...GRID_FILL_COLUMN, key: '_fill' as const },
] as const;

/**
 * This family's compound column array.
 *
 * `C` is the family's own column interface — the widening cast is what lets
 * `RECEIVING_COMPOUND_COLUMNS` stay `ReceivingGridColumnKey`-narrowed while
 * still being the SAME objects Orders, Incoming and Tasks mount.
 *
 * The cast is unavoidable and deliberate: a family's key union is WIDER than
 * {@link CompoundColumnKey} (it also names its flat spreadsheet's tracks), so
 * `ReceivingGridColumn` is not structurally assignable to a compound-keyed
 * track no matter how the constraint is written. What that cast cannot check —
 * that the family's key union actually contains `thumb` / `item` / … — is
 * pinned by {@link COMPOUND_COLUMN_KEYS} assertions in
 * `compound-row-model.test.ts`, which walk every family's exported array. A
 * family whose model lacks a compound key fails there, loudly, on the same run.
 *
 * Returns the module-level array — the tracks are immutable data, so every
 * caller shares one allocation rather than rebuilding the model per render.
 */
export function compoundColumnsFor<C extends { key: string }>(): readonly C[] {
  return COMPOUND_TRACKS as unknown as readonly C[];
}

/**
 * The virtualizer's row estimate for a mounted column model, or `undefined` to
 * keep the house default.
 *
 * A compound table's row box is {@link COMPOUND_ROW_PX} (48), not the flat
 * grid's 40. The virtualizer sizes its scroll runway from this number, so a
 * compound table that inherited 40 under-measured every row by 8px — the
 * scrollbar and every scroll-to landed short, by more the further down you
 * went.
 *
 * Keyed off the presence of a compound track rather than off a flag: the model
 * IS the fact, and a flag would be one more thing that can disagree with what
 * the cells paint.
 */
export function compoundRowEstimateFor(
  columns: readonly { key: string }[],
): number | undefined {
  return columns.some((c) => c.key === 'thumb' || c.key === 'item')
    ? COMPOUND_ROW_PX
    : undefined;
}
