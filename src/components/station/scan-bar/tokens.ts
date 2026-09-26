import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import type { StationTheme } from '@/utils/staff-colors';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';


/** Canonical geometry + chrome for every station scan bar. */

/** Leading icon — MasterNav mode-glyph column. */
export const STATION_SCAN_BAR_ICON_SLOT_CLASS =
  'absolute left-[2.9375rem] top-1/2 z-raised flex h-4 w-4 -translate-y-1/2 items-center justify-center';

export const STATION_SCAN_BAR_DEFAULT_ICON_CLASS = 'h-[17px] w-[17px]';

/** Input text — MasterNav label column (4.3125rem). */
export const STATION_SCAN_BAR_PAD_LEFT_CLASS = 'pl-[4.3125rem]';

export const STATION_SCAN_BAR_PAD_LEFT_NONE_ICON_CLASS = 'pl-[2.9375rem]';

/**
 * Flush band input — transparent so the band's bottom-up station glow shows
 * through. Armed mode segments sit on solid `surface-card` against that glow.
 * Staff bottom-rule applied separately; work canvas owns elevation (border).
 */
export const STATION_SCAN_BAR_INPUT_CLASS = cn(
  'box-border w-full rounded-none bg-transparent text-xs font-semibold leading-normal text-text-default outline-none transition-[border-color] py-2 placeholder:text-text-faint',
  PRIMARY_CHROME_ROW_FACE,
);

/** Unthemed fallback bottom rule (ThemedStationScanBar replaces via staff map). */
export const STATION_SCAN_BAR_DEFAULT_BOTTOM_RULE_CLASS =
  'border-0 border-b-2 border-b-border-soft';

/**
 * Session capture mode (Arrival batch-sort) — amber bottom rule overrides the
 * staff theme so the operator cannot miss that the bar is armed for batching.
 */
export const STATION_SCAN_BAR_SESSION_CAPTURE_BOTTOM_RULE_CLASS =
  'border-0 border-b-2 border-b-amber-500';

/** Staff-themed idle bottom rule — single chrome story for every station scan bar. */
export const STATION_SCAN_BAR_BOTTOM_RULE_CLASS: Record<StationTheme, string> = {
  green: 'border-0 border-b-2 border-b-emerald-500',
  blue: 'border-0 border-b-2 border-b-blue-500',
  purple: 'border-0 border-b-2 border-b-purple-500',
  yellow: 'border-0 border-b-2 border-b-amber-500',
  black: 'border-0 border-b-2 border-b-slate-700', // ds-allow-raw-neutral: identity hue — staff vocabulary
  red: 'border-0 border-b-2 border-b-red-500',
  lightblue: 'border-0 border-b-2 border-b-sky-500',
  pink: 'border-0 border-b-2 border-b-pink-500',
};

/**
 * Absolute frosted mode rail — sits above full-bleed input text. Translucent
 * card + light blur keep glyphs readable while long placeholders soft-peek
 * underneath. Never an opaque white wall; never magic `pr-*` clearance.
 */
export const STATION_SCAN_BAR_RIGHT_SLOT_CLASS =
  'absolute inset-y-0 right-0 z-dropdown isolate flex items-stretch gap-0 bg-surface-card/70 backdrop-blur-sm';

/**
 * Soft dissolve from field ink into the frosted rail — paints just left of the
 * rail so truncation is a fade, not a hard clip against the first glyph.
 */
export const STATION_SCAN_BAR_RIGHT_FADE_CLASS =
  'pointer-events-none absolute inset-y-0 right-full w-4 bg-gradient-to-r from-transparent to-surface-card/70';

/**
 * How many px of input ink intentionally peek under the frosted rail. Keeps
 * "Purchase order" readable at the edge without parking the caret under icons.
 */
export const STATION_SCAN_BAR_RAIL_PEEK_PX = 14;

/** Fallback pad while the rail is measuring (avoids a one-frame text flash). */
export const STATION_SCAN_BAR_RAIL_PAD_FALLBACK_PX = 72;

/**
 * Optical glyph box for every right-rail icon (mode / paste / spinner).
 * `[&_svg]:block` kills baseline gap so Ticket / Pin / Hash look evenly spaced.
 */
export const STATION_SCAN_BAR_MODE_GLYPH_CLASS =
  'block h-3.5 w-3.5 shrink-0';

/**
 * Shared right-rail cell — matches compact mode width. Use for spinner / paste
 * so they occupy the same column rhythm as mode segments.
 */
export const STATION_SCAN_BAR_RIGHT_CELL =
  'flex h-full w-8 shrink-0 items-center justify-center';

/** Full-band mode segment — default width. */
export const STATION_SCAN_BAR_MODE_BTN =
  cn('flex h-full w-9 shrink-0 items-center justify-center rounded-none transition-colors', focusRing('cell', 'neutral'));

/** Full-band mode segment — tighter width for 3–4 mode rails. */
export const STATION_SCAN_BAR_MODE_BTN_COMPACT =
  cn('flex h-full w-8 shrink-0 items-center justify-center rounded-none transition-colors', focusRing('cell', 'neutral'));

/** Idle mode — transparent on chrome; hover only. */
export const STATION_SCAN_BAR_MODE_BTN_INACTIVE =
  'relative z-base text-text-soft hover:bg-surface-hover/50 hover:text-text-muted';

/**
 * Armed mode — solid card plane (same token as work canvas) so the segment
 * reads as elevated depth, not a nested tinted pill. Domain `armedClass`
 * supplies icon/text hue only — do not add bg-* there.
 */
export const STATION_SCAN_BAR_MODE_BTN_ARMED =
  'relative z-dropdown bg-surface-card';

/** Submit confirm flash — sits on the bottom edge; same hue family as the rule. */
export const STATION_SCAN_BAR_SUBMIT_TRACE_CLASS: Record<StationTheme, string> = {
  green: 'bg-emerald-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  yellow: 'bg-amber-500',
  black: 'bg-slate-700', // ds-allow-raw-neutral: identity hue among staff themes
  red: 'bg-red-500',
  lightblue: 'bg-sky-500',
  pink: 'bg-pink-500',
};

export const STATION_SCAN_BAR_DEFAULT_SUBMIT_TRACE_CLASS = 'bg-blue-500';

/**
 * Parked-strip mini scan cell — idle Plus hover wash + bottom-rule preview in
 * the staff theme (same hue family as {@link STATION_SCAN_BAR_BOTTOM_RULE_CLASS}).
 */
export const STATION_SCAN_BAR_COLLAPSE_HOVER_CLASS: Record<StationTheme, string> = {
  green: 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-b-emerald-500',
  blue: 'hover:bg-blue-50 hover:text-blue-700 hover:border-b-blue-500',
  purple: 'hover:bg-purple-50 hover:text-purple-700 hover:border-b-purple-500',
  yellow: 'hover:bg-amber-50 hover:text-amber-800 hover:border-b-amber-500',
  black: 'hover:bg-surface-hover hover:text-text-default hover:border-b-slate-700', // ds-allow-raw-neutral: identity hue — staff vocabulary
  red: 'hover:bg-red-50 hover:text-red-700 hover:border-b-red-500',
  lightblue: 'hover:bg-sky-50 hover:text-sky-700 hover:border-b-sky-500',
  pink: 'hover:bg-pink-50 hover:text-pink-700 hover:border-b-pink-500',
};

export const STATION_SCAN_BAR_COLLAPSE_HOVER_DEFAULT_CLASS =
  'hover:bg-surface-hover hover:text-text-default hover:border-b-border-soft';

/** Focus brightens the same bottom rule — no second ring language. */
export function stationScanBarFocusInputClass(theme: StationTheme): string {
  return `focus:border-b-${theme}-600 focus:ring-0`; // ds-allow-focus: identity/one-off hue or ring-0
}
