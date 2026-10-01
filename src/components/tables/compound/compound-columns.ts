/**
 * The compound row's COLUMN model — one declaration, every family.
 * identity chips and the title hover (operator 2026-09-04). A money `amount`
 */

import { GRID_FILL_COLUMN } from '@/design-system/components/grid';
import { DATA_TABLE_ID_HEADER_WORD } from '@/lib/tables/data-table-family';
import type { ColumnType } from '@/lib/tables/table-columns';
import {
  COMPOUND_GUTTER_TRACK_REM,
  COMPOUND_ROW_PX,
  COMPOUND_SELECT_TRACK_REM,
} from './compound-row-chrome';

/**
 * The compound track keys, in canonical order.
 * handle, then match the photo. Operator 2026-09-04 put ids on the left; the
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

type CompoundColumnKey = (typeof COMPOUND_COLUMN_KEYS)[number];

/** Structural shape of one compound track. */
interface CompoundTrack {
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

/** The gutter track, as a CSS `minmax()`. */
const GUTTER_TRACK = `minmax(${COMPOUND_GUTTER_TRACK_REM}rem, ${COMPOUND_GUTTER_TRACK_REM}rem)`;
const SELECT_TRACK = `minmax(${COMPOUND_SELECT_TRACK_REM}rem, ${COMPOUND_SELECT_TRACK_REM}rem)`;

/** The ONE compound geometry declaration. */
export const COMPOUND_TRACKS: readonly CompoundTrack[] = [
  {
    key: 'select',
    // NARROWER than `thumb` since 2026-09-04, and from its own constant.
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
    // MEASURED, not guessed:
    width: 'minmax(6.5rem, 6.5rem)',
    // The identity header is the ENGINE's word, in BOTH faces — the word lives in `data-table-family.ts` and the families may not re-declare it
    // (operator 2026-09-15: "the ID as the first column … instead of
    label: DATA_TABLE_ID_HEADER_WORD,
    // **Id, not Order** (operator 2026-09-14:
    // **Id, not Order** (operator 2026-09-14: "the slot data table displays as
    gridLabel: DATA_TABLE_ID_HEADER_WORD,
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
    // CENTRED over the 48px square (operator 2026-09-04, reversing the far-left ruling made earlier the same day).
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
    // 7rem — the `date` display-type default in `trackGeometryFor`, so a chrome date track and a BOUND one (`orders.age`,…
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

/** This family's compound column array. */
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

/** The virtualizer's row estimate for a mounted column model, or `undefined` to keep the house default. */
export function compoundRowEstimateFor(
  columns: readonly { key: string }[],
): number | undefined {
  return columns.some((c) => c.key === 'thumb' || c.key === 'item')
    ? COMPOUND_ROW_PX
    : undefined;
}

/** Is this the compound model, rather than a family's flat spreadsheet? */
export function isCompoundColumnModel(columns: readonly { key: string }[]): boolean {
  return columns.some((c) => c.key === 'thumb' || c.key === 'item');
}
