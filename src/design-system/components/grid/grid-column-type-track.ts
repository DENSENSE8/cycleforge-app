/** Typed column TRACK FLOORS — content minimum rem by type display face. */

import type { LedgerGridColumnModel } from './grid-surface-descriptor';

/** How a `date`-typed column renders — drives the type track floor. */
export type DateColumnFace = 'day' | 'stamp' | 'duration';

/** Content floor rem for each date face. */
export const MIN_TRACK_REM_BY_DATE_FACE: Record<DateColumnFace, number> = {
  day: 4.5,
  stamp: 12,
  duration: 3,
};

/** Channel / marketplace mark track (`type: */
export const MIN_TRACK_REM_EXTERNAL = 4;

/** Qty / number track floor. */
export const MIN_TRACK_REM_QTY_FRACTION = 4.5;

type MinTrackColumn = Pick<LedgerGridColumnModel, 'type' | 'dateFace' | 'minTrackRem'>;

/** Resolved content-floor rem for a column. */
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
