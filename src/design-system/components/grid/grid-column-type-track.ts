/**
 * Typed column TRACK FLOORS — content minimum rem by type display face.
 *
 * Sibling to {@link ./grid-header-align} (type → justify) and
 * `ColumnTypeGlyph` (type → header mark). Fact columns carry a floor so
 * end-aligned + `overflow-hidden` + nowrap stamps cannot clip on the left
 * (Receiving DATE: `g 3 4:54 PM`).
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

type MinTrackColumn = Pick<LedgerGridColumnModel, 'type' | 'dateFace' | 'minTrackRem'>;

/**
 * Resolved content-floor rem for a column. Explicit `minTrackRem` wins;
 * `type: 'date'` uses {@link MIN_TRACK_REM_BY_DATE_FACE} (`dateFace ?? 'day'`);
 * other types return `0` until a broader type map lands.
 */
export function resolveGridColumnMinTrackRem(column: MinTrackColumn): number {
  if (column.minTrackRem != null) return column.minTrackRem;
  if (column.type === 'date') {
    const face = column.dateFace ?? 'day';
    return MIN_TRACK_REM_BY_DATE_FACE[face];
  }
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
