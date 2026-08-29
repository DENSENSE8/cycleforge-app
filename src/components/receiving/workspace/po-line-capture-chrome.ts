/**
 * Chrome SoT for the Unbox PO-line capture row.
 *
 * ONE update token: the always-accessible row is
 * `[ Tags / pills | SerialScanField / PhotoStepDockStrip | segments ]`
 * with Serial open by default (optimistic). Hover-expanding condition pills
 * shares the SAME wrapper — serial + Photos stay mounted on the right.
 * Photos expands in-row to the same dock Link | Upload | Send strip. Change a
 * height, a seam or the green plate here and every SKU line moves — found,
 * unfound, qty 1, qty N, qty roll-up, empty stub.
 *
 * The row is INVARIANT: both segments stay in the order token; Serial and
 * Photos expand in-row. No segment is ever disabled by capture state.
 */

import { STATION_CONTEXT_PHOTO_TONE } from '@/components/station/entity-context/station-context-action-pill';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/**
 * Fixed segment order, left → right after the condition bar: this unit's
 * identity, then its evidence. It never changes with state — an operator
 * reaches for the same cell every time.
 */
export const CAPTURE_SEGMENT_ORDER = ['serial', 'photos'] as const;
export type CaptureSegmentKey = (typeof CAPTURE_SEGMENT_ORDER)[number];

/** Row height — shared with the dock's Band 1 so the floor reads as one rhythm. */
const PO_LINE_CAPTURE_ROW_HEIGHT = 'h-11';

/**
 * The joined bar. Square cells, soft column seams, hairline top/bottom rules
 * against the PO meta above and any open panel below.
 */
export const PO_LINE_CAPTURE_ROW_CLASS = cn(
  'flex w-full min-w-0 items-stretch overflow-hidden',
  PO_LINE_CAPTURE_ROW_HEIGHT,
  'divide-x divide-border-soft border-y border-border-hairline bg-surface-card',
);

/** Condition host — flex-1 when expanded, shrink-0 Tags when collapsed. */
export const PO_LINE_CAPTURE_CONDITION_CLASS =
  'flex min-w-0 items-stretch [&>*]:h-full';

/**
 * A trailing segment: ICON ONLY, square, full-height, never `disabled`. No
 * text label — the glyph is the whole control, and words competing with the
 * condition names is what made the row unreadable at bench distance. What each
 * one is, and what it holds, lives in the tooltip + `aria-label`.
 */
const PO_LINE_CAPTURE_SEGMENT_CLASS = cn(
  'ds-raw-button inline-flex h-full w-11 shrink-0 items-center justify-center',
  'transition-colors',
  focusRing('control', 'accent'),
);

/**
 * Serial is green — the same hue as the add / commit controls this bench
 * already presses to put an identifier on a unit.
 */
const PO_LINE_CAPTURE_SERIAL_CLASS =
  'bg-emerald-50 text-emerald-700 hover:bg-emerald-100';

/**
 * Photos is blue, and it is deliberately the SAME blue as the carton identity
 * Photos control above it ({@link STATION_CONTEXT_PHOTO_TONE}) — one control
 * for "photograph this thing", two altitudes, so an operator reads them as the
 * same button rather than two features that happen to hold a camera.
 */
const PO_LINE_CAPTURE_PHOTOS_CLASS = STATION_CONTEXT_PHOTO_TONE;

export const PO_LINE_CAPTURE_GLYPH_CLASS = 'h-5 w-5 shrink-0';

/**
 * Captured count on a segment — a small numeral, never a check. A tick says
 * "done"; the number says what is actually there. Inherits the segment's own
 * ink so it cannot drift from its plate.
 */
export const PO_LINE_CAPTURE_COUNT_CLASS = cn(
  'pointer-events-none absolute right-1 top-1 min-w-3 px-0.5',
  'text-role-micro font-semibold tabular-nums leading-none',
);

export function captureSegmentClass(opts: {
  key: CaptureSegmentKey;
  /** Open plate — field / strip owns the width; icon segment is hidden. */
  open?: boolean;
}): string {
  return cn(
    'relative',
    PO_LINE_CAPTURE_SEGMENT_CLASS,
    opts.key === 'serial'
      ? PO_LINE_CAPTURE_SERIAL_CLASS
      : PO_LINE_CAPTURE_PHOTOS_CLASS,
    opts.open ? 'hidden' : null,
  );
}
