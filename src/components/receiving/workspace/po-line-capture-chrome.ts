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
 * The joined bar. Square cells, and since 2026-08-30 NO rules at all — no
 * top/bottom hairline against the PO meta, and no column seams between the
 * cells.
 *
 * The cells already separate themselves: Tags is a filled plate, Serial is a
 * white field, the check is emerald and Photos is blue. A seam between two
 * cells that are already different colours is a line drawn over a boundary
 * that was never in question.
 */
export const PO_LINE_CAPTURE_ROW_CLASS = cn(
  'flex w-full min-w-0 items-stretch overflow-hidden',
  PO_LINE_CAPTURE_ROW_HEIGHT,
  'bg-surface-card',
);

/** Condition host — flex-1 when expanded, shrink-0 Tags when collapsed. */
export const PO_LINE_CAPTURE_CONDITION_CLASS =
  'flex min-w-0 items-stretch [&>*]:h-full';

/**
 * The FAR-RIGHT action cluster — exact/no-serial check, then Photos.
 *
 * The composer's anatomy is positional: the MIDDLE (Serial field, or the Photos
 * strip) takes every pixel the leading Tags and this cluster do not, and every
 * verification action lives here. One element, so the cells read as a group
 * flush against the bar's right edge rather than strays the flex row happened
 * to leave there. No seam inside it — the check is emerald and Photos is blue,
 * and a rule between two differently-coloured plates separates nothing.
 * Composed by {@link PoLineCaptureRow} and, for the joined field's own commit
 * cell, by `SerialScanField`.
 */
export const PO_LINE_CAPTURE_ACTIONS_CLASS =
  'flex h-full shrink-0 items-stretch';

/**
 * Trailing action cell width. The commit / waiver cell and the Photos segment
 * are the SAME square (`w-11`, matching {@link PO_LINE_CAPTURE_SEGMENT_CLASS}) —
 * a 56px check beside a 44px camera reads as two unrelated controls that
 * happened to end up adjacent.
 */
export const PO_LINE_CAPTURE_ACTION_WIDTH = 'w-11';

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
