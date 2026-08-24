/**
 * Typed column TRACK FLOORS — content minimum rem by type display face.
 *
 * Sibling to {@link ./grid-header-align} (type → justify) and
 * `ColumnTypeGlyph` (type → header mark). Fact columns carry a floor so
 * end-aligned + `overflow-hidden` + nowrap stamps cannot clip on the left
 * (Receiving DATE: `g 3 4:54 PM`), and so fixed-footprint channel marks cannot
 * press through the shared hairline into the next start-aligned track
 * (Unbox History PLATFORM → TRACKING).
 *
 * `type: 'date'` covers three faces — one blunt `date → 12rem` would widen
 * Incoming By / Age. Face is declared on the column model (`dateFace`);
 * default `'day'` keeps existing day-only tracks honest.
 *
 * Surfaces size tracks with `minmax(Xrem, Xrem)` where X ≥
 * {@link resolveGridColumnMinTrackRem}. Drag-resize clamps to the same floor.
 */

import type { LedgerGridColumnModel } from './grid-surface-descriptor';

/** How a `date`-typed column renders — drives the type track floor. */
export type DateColumnFace = 'day' | 'stamp' | 'duration';

/**
 * Content floor rem for each date face.
 *
 * - **day** — civil day only (`Aug 3` / Incoming By)
 * - **stamp** — day + time on one line (`Aug 3 4:54 PM` + cell inset)
 * - **duration** — compact age / SLA (`12d` / `4h`)
 */
export const MIN_TRACK_REM_BY_DATE_FACE: Record<DateColumnFace, number> = {
  day: 4.5,
  stamp: 12,
  duration: 3,
};

/**
 * Channel / marketplace mark track (`type: 'external'`).
 *
 * Measured: cell inset (`px-2` × 2 = 1rem) + `PlatformMark` box (`h-5 w-5` =
 * 1.25rem) + hairline breathing so a start-aligned brand mark does not sit on
 * the shared rule into TRACKING. Matches the house drag-resize floor
 * (`COLUMN_WIDTH_MIN` = 64px ≈ 4rem at 16px root) so SoT default and clamp
 * agree — a 3rem default was below that floor and jammed Unbox History.
 */
export const MIN_TRACK_REM_EXTERNAL = 4;

/**
 * Qty / number track floor.
 *
 * Sized for worst-case received/expected fraction (`9999/9999`) + cell inset
 * (`px-2` × 2). A 3.5rem floor was sized for the header word "Qty" and clipped
 * tabular-nums.
 */
export const MIN_TRACK_REM_QTY_FRACTION = 4.5;

type MinTrackColumn = Pick<LedgerGridColumnModel, 'type' | 'dateFace' | 'minTrackRem'>;

/**
 * Resolved content-floor rem for a column. Explicit `minTrackRem` wins;
 * `type: 'date'` uses {@link MIN_TRACK_REM_BY_DATE_FACE} (`dateFace ?? 'day'`);
 * `type: 'external'` uses {@link MIN_TRACK_REM_EXTERNAL}; other types return
 * `0` until a broader type map lands.
 */
export function resolveGridColumnMinTrackRem(column: MinTrackColumn): number {
  if (column.minTrackRem != null) return column.minTrackRem;
  if (column.type === 'date') {
    const face = column.dateFace ?? 'day';
    return MIN_TRACK_REM_BY_DATE_FACE[face];
  }
  if (column.type === 'external') return MIN_TRACK_REM_EXTERNAL;
  if (column.type === 'number') return MIN_TRACK_REM_QTY_FRACTION;
  return 0;
}

/** Rem → px at the document root (16px fallback when SSR / no window). */
export function gridTrackRemToPx(rem: number, rootPx = 16): number {
  if (typeof document !== 'undefined') {
    const parsed = parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (Number.isFinite(parsed) && parsed > 0) return rem * parsed;
  }
  return rem * rootPx;
}
