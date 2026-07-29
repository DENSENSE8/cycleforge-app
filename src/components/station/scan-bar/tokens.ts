import type { StationTheme } from '@/utils/staff-colors';

/**
 * Canonical geometry + chrome for every station scan bar. Change padding,
 * height, icon slot, or placeholder styling HERE — not per surface.
 *
 * Chrome: flat band + staff bottom-rule + bottom-up station glow (chromatic
 * depth). Mode segments are full-height flush siblings — armed = solid
 * `surface-card` against the glow so they read continuous with the work
 * canvas. Submit confirm is a center→edges scaleX flash on the bottom rule.
 * Work canvas elevation is border-only — no competing drop shadows at the join.
 *
 * Stacking (low → high): input @ z-base → icon @ z-raised → submit trace @
 * z-raised → right rail @ z-dropdown → armed mode segment @ z-dropdown.
 *
 * Left column has two modes ({@link StationScanBarProps.leadingColumn}):
 *   • `masternav` (default) — icon under the MasterNav mode glyph
 *     (`left-[2.9375rem]`), text under the MasterNav label (`pl-[4.3125rem]`).
 *     For station benches with no recent rail below.
 *   • `rail` — structural share of {@link SIDEBAR_SCAN_DOCK_LEADING_ROW} from
 *     `header-shell` (pad → DOT_TRACK → gap); icon in the track, input `pl-0`
 *     so typed text lands on the row title. No rem twin — density tracks the
 *     same tokens as the UNBOXED eyebrow / rail titles.
 * Full literals so Tailwind scans MasterNav pads (see header-shell for rail).
 */

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
export const STATION_SCAN_BAR_INPUT_CLASS =
  'box-border h-10 w-full rounded-none bg-transparent text-xs font-semibold leading-normal text-text-default outline-none transition-[border-color] py-2 placeholder:text-text-faint';

/** Unthemed fallback bottom rule (ThemedStationScanBar replaces via staff map). */
export const STATION_SCAN_BAR_DEFAULT_BOTTOM_RULE_CLASS =
  'border-0 border-b-2 border-b-border-soft';

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
 * Full-height right rail — flush to the band edge (no frosted glass chip).
 * Mode / spinner / paste share equal-width cells so glyphs stack on one grid.
 */
export const STATION_SCAN_BAR_RIGHT_SLOT_CLASS =
  'absolute inset-y-0 right-0 z-dropdown isolate flex items-stretch gap-0';

/** Narrower right inset when mode rails / spinners sit inside the bar. */
export const STATION_SCAN_BAR_RIGHT_CONTENT_CLASS = 'right-0 gap-0';

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
  'flex h-full w-9 shrink-0 items-center justify-center rounded-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-emphasis/60';

/** Full-band mode segment — tighter width for 3–4 mode rails. */
export const STATION_SCAN_BAR_MODE_BTN_COMPACT =
  'flex h-full w-8 shrink-0 items-center justify-center rounded-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-emphasis/60';

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

/** Focus brightens the same bottom rule — no second ring language. */
export function stationScanBarFocusInputClass(theme: StationTheme): string {
  return `focus:border-b-${theme}-600 focus:ring-0`;
}
