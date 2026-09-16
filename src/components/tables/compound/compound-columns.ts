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
 * The three fixed tracks: `select` and `thumb` (the two gutters — control
 * widths, not content) and `_fill` (structural slack). A ⋮ `actions` track is
 * not in this skeleton: copy / listing / void already live inline on the
 * identity chips and the title hover (operator 2026-09-04). A money `amount`
 * track is not in this skeleton: price lives under the Item title after qty.
 *
 * The widths below are DEFAULTS, not a ceiling. `fulfillment` was 11rem, then
 * 8.5rem, and is 6.5rem now — each step measured against what the cell actually
 * renders rather than estimated. An operator who works long PO numbers drags it
 * wider once and it sticks.
 */

import { GRID_FILL_COLUMN } from '@/design-system/components/grid';
import { SLOT_TABLE_ID_HEADER_WORD } from '@/lib/tables/slot-table-id-header-law';
import type { ColumnType } from '@/lib/tables/table-columns';
import {
  COMPOUND_GUTTER_TRACK_REM,
  COMPOUND_ROW_PX,
  COMPOUND_SELECT_TRACK_REM,
} from './compound-row-chrome';

/**
 * The compound track keys, in canonical order.
 *
 * HARD RULE — select · ids · image · title · dates · status · slack.
 * The identity pane is leftmost: check the row, read the order / tracking
 * handle, then match the photo. Operator 2026-09-04 put ids on the left; the
 * ⋮ that sat beside them is gone the same day — those verbs already live on
 * the chips and the title hover. Line money is not a track: it lives under
 * the Item title after qty (`ensureLineMoneySubtitle`).
 *
 * `dates` sits between the title and the status because it answers WHEN, and
 * WHEN is read against WHAT, not against a lifecycle word (operator
 * 2026-09-04). It also unfuses the status cell: the deadline used to ride the
 * status column's second line, which spent the one line under the state pill on
 * a date and left the row unable to say where it goes NEXT.
 */
export const COMPOUND_COLUMN_KEYS = [
  'select',
  'fulfillment',
  'thumb',
  'item',
  'dates',
  'state',
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
  headerGlyphOnly?: boolean;
  headerForceLabel?: boolean;
  align?: 'start' | 'end' | 'center';
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
const SELECT_TRACK = `minmax(${COMPOUND_SELECT_TRACK_REM}rem, ${COMPOUND_SELECT_TRACK_REM}rem)`;

/**
 * The ONE compound geometry declaration.
 *
 * | track         | width  | resize | carries                              |
 * |---------------|--------|--------|--------------------------------------|
 * | `select`      | 1.5rem | no     | 16px hover-revealed checkbox (frozen)|
 * | `fulfillment` | 6.5rem | yes    | order / PO over carrier tracking     |
 * | `thumb`       | 3rem   | no     | full-bleed square photo (frozen)     |
 * | `item`        | 18rem  | yes    | title over the operator note         |
 * | `dates`       | 7rem   | yes    | ordered-on over the ship-by deadline |
 * | `state`       | 10rem  | yes    | state pill over the NEXT step        |
 * | `_fill`       | 1fr    | no     | sole slack track                     |
 *
 * Both gutters take ZERO cell inset — they are the only tracks whose contents
 * go edge to edge. They are no longer the same WIDTH: `thumb` is the row box in
 * rem (a true square, so a photo fills it uncropped) and `select` is the
 * narrower `COMPOUND_SELECT_TRACK_REM`. See that constant for why the equality
 * was retired.
 *
 * The frozen pane is `select · fulfillment · thumb` — a contiguous prefix,
 * because `gridFrozenLeft` sums the widths of preceding frozen tracks and a
 * gap would pin the sticky pane at the wrong origin. Those offsets are a
 * `calc()` over the same `--cf-col-*` vars a drag writes, so the pane follows
 * a resized Order track. Fulfillment has no `hideKey`: a frozen identity
 * column is structural and must not leave the pane.
 */
export const COMPOUND_TRACKS: readonly CompoundTrack[] = [
  {
    key: 'select',
    // NARROWER than `thumb` since 2026-09-04, and from its own constant. The
    // two tracks were declared equal while both were full-bleed squares; the
    // select gutter now holds a 16px hover-revealed control, so 48px would be
    // 16px of dead track on either side of it. See `COMPOUND_SELECT_TRACK_REM`.
    width: SELECT_TRACK,
    label: 'Select',
    // No header word: the column is a bare control track, and the select-all
    // box at the top of it already says what it is.
    gridLabel: '',
    sortable: false,
    frozen: true,
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
    // The identity header is the ENGINE's word, in BOTH faces — the law module
    // is `slot-table-id-header-law.ts` and the families may not re-declare it
    // (operator 2026-09-15: "the ID as the first column … instead of
    // differences"). `'Fulfillment'` was an Orders-era leftover from when this
    // track was carrier data; it survived in `label` because only `gridLabel`
    // was ruled on 2026-09-14, and 22 column modules overrode both anyway.
    label: SLOT_TABLE_ID_HEADER_WORD,
    // **Id, not Order** (operator 2026-09-14: "the slot data table displays as
    // id and not order for the second column" … "just Id"). ONE word for one
    // track, on the
    // shared skeleton: a per-family override would be a copied array, which
    // `compound-row-model.test.ts` rejects by object identity — the assertion
    // that keeps every compound table reading as one product.
    //
    // The word is portable and the track always held an identity handle: an
    // order number on To-ship, a PO on Receiving, `daily_check_items.id` on
    // Daily. What differs is the FACT in the cell, which is the only
    // difference between two of these tables there is meant to be — a family
    // whose handle is not a marketplace order paints it through
    // `CompoundRowView.identityFace` instead of `orderId`.
    //
    // Same disposal as the Orders-only "Order date" on the DATES hover, which
    // became the portable `COMPOUND_DATES_START_HOVER`.
    gridLabel: SLOT_TABLE_ID_HEADER_WORD,
    type: 'id',
    align: 'start',
    frozen: true,
    resizable: true,
    minTrackRem: 6,
    labelFitRem: 5,
  },
  {
    key: 'thumb',
    frozen: true,
    width: GUTTER_TRACK,
    label: 'Image',
    // The word, not a glyph (operator 2026-09-01). The track is a 48px square;
    // `headerForceLabel` is the declared intent so the fit test cannot degrade
    // it back to a type mark.
    gridLabel: 'Image',
    type: 'image',
    headerForceLabel: true,
    // CENTRED over the 48px square (operator 2026-09-04, reversing the far-left
    // ruling made earlier the same day). The track is a full-bleed photo with
    // no left edge of its own for a word to sit against, and the label reads as
    // the caption of the square beneath it rather than as a stray word in the
    // gutter. It is the one centred header in the grid, and it is centred over
    // the one full-bleed content track.
    align: 'center',
    // NOT resizable: the photo track is chrome, and a drag could only crop the
    // square or leave dead space around it.
    resizable: false,
    labelFitRem: 2,
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
    key: 'dates',
    // 7rem — the `date` display-type default in `trackGeometryFor`, so a chrome
    // date track and a BOUND one (`orders.age`, `orders.delivery_event`) are
    // the same width. Both lines are a compact civil face ("Aug 17"), and the
    // widest thing either can hold is a month word plus two digits.
    width: 'minmax(7rem, 7rem)',
    label: 'Dates',
    gridLabel: 'Dates',
    type: 'date',
    align: 'start',
    hideKey: 'dates',
    resizable: true,
    minTrackRem: 5.5,
    labelFitRem: 4.5,
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
  { ...GRID_FILL_COLUMN, key: '_fill' as const },
] as const;

/**
 * This family's compound column array.
 *
 * `C` is the family's own column interface — the widening assertion is what
 * lets `RECEIVING_COMPOUND_COLUMNS` stay `ReceivingGridColumnKey`-narrowed
 * while still being the SAME objects Orders, Incoming and Tasks mount.
 *
 * A family's key union is WIDER than {@link CompoundColumnKey} (it also names
 * its flat spreadsheet's tracks), so `ReceivingGridColumn` is not structurally
 * assignable to a compound-keyed track. What that assertion cannot check —
 * that the family's key union actually contains `thumb` / `item` / … — is
 * pinned by {@link COMPOUND_COLUMN_KEYS} assertions in
 * `compound-row-model.test.ts`, which walk every family's exported array. A
 * family whose model lacks a compound key fails there, loudly, on the same run.
 *
 * Returns the module-level array — the tracks are immutable data, so every
 * caller shares one allocation rather than rebuilding the model per render.
 */
export function compoundColumnsFor<C extends { key: string }>(): readonly C[] {
  const tracks = COMPOUND_TRACKS;
  assertFamilyColumnTracks<C>(tracks);
  return tracks;
}

function assertFamilyColumnTracks<C extends { key: string }>(
  tracks: readonly { key: string }[],
): asserts tracks is readonly C[] {
  void tracks;
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
