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
 * Every DATA track is `resizable: true`. The engine already owns the mechanics
 * (drag handle in `LedgerGridColumnHeader`, `--cf-col-*` vars written by
 * `ColumnResizeHandle`, per-staff persistence via `useGridColumnWidths`), so
 * this is a flag, not a feature build.
 *
 * The four CHROME tracks stay fixed: `select` and `thumb` (the two equal
 * gutters — see `COMPOUND_GUTTER_TRACK_REM` for why a drag there would break
 * the equality), `open` (a 2.5rem chevron) and `_fill` (structural slack).
 * None of their contents has a variable length, so a drag could only add or
 * steal whitespace around a fixed mark.
 *
 * The widths below are DEFAULTS, not a ceiling. `fulfillment` was 11rem, then
 * 8.5rem, and is 6.5rem now — each step measured against what the cell actually
 * renders rather than estimated. An operator who works long PO numbers drags it
 * wider once and it sticks.
 */

import { GRID_FILL_COLUMN } from '@/lib/grid/grid-fill-column';
import type { ColumnType } from '@/lib/tables/table-columns';
import { COMPOUND_GUTTER_TRACK_REM, COMPOUND_ROW_PX } from './compound-row-chrome';

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
 * The gutter track, as a CSS `minmax()`.
 *
 * Kept as a `minmax(Xrem, Xrem)` string on purpose: `gridColumnTrackRem` parses
 * the rem out of this shape to build the frozen pane's sticky-left `calc()`,
 * and falls back to 12rem for any width string that names no rem — which
 * silently un-pins the pane.
 */
const GUTTER_TRACK = `minmax(${COMPOUND_GUTTER_TRACK_REM}rem, ${COMPOUND_GUTTER_TRACK_REM}rem)`;

/**
 * The ONE compound geometry declaration.
 *
 * | track         | width  | resize | carries                              |
 * |---------------|--------|--------|--------------------------------------|
 * | `select`      | 3rem   | no     | full-bleed checkmark (frozen)        |
 * | `thumb`       | 3rem   | no     | full-bleed square photo (frozen)     |
 * | `fulfillment` | 6.5rem | yes    | order / PO over carrier tracking     |
 * | `item`        | 18rem  | yes    | title over the operator note         |
 * | `state`       | 10rem  | yes    | state pill over lateness             |
 * | `open`        | 2.5rem | no     | chevron → the record                 |
 * | `_fill`       | 1fr    | no     | sole slack track                     |
 *
 * The two gutters are EQUAL BY CONSTRUCTION — both read
 * `COMPOUND_GUTTER_TRACK_REM`, which is the row box in rem. They are the only
 * tracks whose contents go edge to edge with no cell inset at all.
 *
 * The frozen pane is `select · thumb` — a contiguous prefix, because
 * `gridFrozenLeft` sums the widths of preceding frozen tracks and a gap would
 * pin the sticky pane at the wrong origin. Those offsets are a `calc()` over
 * the same `--cf-col-*` vars a drag writes, so the pane would follow a resized
 * track if either gutter were ever unpinned.
 */
export const COMPOUND_TRACKS: readonly CompoundTrack[] = [
  {
    key: 'select',
    // The SAME width as `thumb`, from one constant — the two full-bleed squares
    // that open every row. Declared equal rather than written equal.
    width: GUTTER_TRACK,
    label: 'Select',
    // No header word: the column is a 48px checkmark square and the faded check
    // in every body cell already says what it is.
    gridLabel: '',
    sortable: false,
    frozen: true,
    resizable: false,
    labelFitRem: 2,
  },
  {
    key: 'thumb',
    frozen: true,
    width: GUTTER_TRACK,
    label: 'Photo',
    // Empty grid label: the column is a 48px square with no room for a word,
    // and the photos themselves say what the track is.
    gridLabel: '',
    align: 'start',
    sortable: false,
    // NOT resizable, and that is the point: `isGridColumnResizable` refuses
    // `select` unconditionally, so a draggable photo track could only ever end
    // up a different width from the checkmark track beside it.
    resizable: false,
    labelFitRem: 2,
  },
  {
    key: 'fulfillment',
    // MEASURED, not guessed: an 8-character order id renders 69px including its
    // brand dot and gap. At 8.5rem (136px, less 16px of cell inset) that left
    // 51px of dead space piled against the Item title, because a fixed track
    // puts ALL its slack on one side and this cell is left-aligned. 6.5rem
    // leaves ~19px — enough that a slightly longer id still fits, little enough
    // that it reads as one column breathing rather than two columns apart.
    //
    // It cannot be content-sized. Every ROW is its own CSS grid, so a
    // `max-content` track would resolve per row and no two rows' columns would
    // land at the same x — the tracks are fixed precisely so the grid stays a
    // grid. An operator who works longer ids drags this wider once (it is the
    // resizable track it always was) and it sticks.
    width: 'minmax(6.5rem, 6.5rem)',
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

/**
 * Is this the compound model, rather than a family's flat spreadsheet?
 *
 * Keyed off the presence of a compound-only track. The `select` cell is the
 * reason this exists: every grid in the repo has a `select` column, so the
 * shared compound renderer can only claim that key once it knows which layout
 * is mounted. A flag would be one more thing that can disagree with the model.
 */
export function isCompoundColumnModel(columns: readonly { key: string }[]): boolean {
  return columns.some((c) => c.key === 'thumb' || c.key === 'item');
}
