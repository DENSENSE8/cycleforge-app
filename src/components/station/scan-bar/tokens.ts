import type { StationTheme } from '@/utils/staff-colors';

/**
 * Canonical geometry + chrome for every station scan bar. Change padding,
 * height, icon slot, or placeholder styling HERE — not per surface.
 *
 * Chrome: bottom color rule only (no full box stroke). Submit confirm is a
 * center→edges scaleX flash on that same bottom edge — not a gradient sweep.
 *
 * Stacking (low → high): input @ z-base → icon @ z-raised → submit trace @
 * z-raised → right rail @ z-dropdown → armed mode chip @ z-dropdown.
 */

export const STATION_SCAN_BAR_ICON_SLOT_CLASS =
  'absolute left-3.5 top-1/2 z-raised flex -translate-y-1/2 items-center justify-center -ml-1';

export const STATION_SCAN_BAR_DEFAULT_ICON_CLASS = 'h-[17px] w-[17px]';

export const STATION_SCAN_BAR_PAD_LEFT_CLASS = 'pl-7';

export const STATION_SCAN_BAR_PAD_LEFT_NONE_ICON_CLASS = 'pl-3.5';

/** Flush band input — no side/top stroke; staff bottom-rule is applied separately. */
export const STATION_SCAN_BAR_INPUT_CLASS =
  'box-border h-10 w-full rounded-none bg-surface-canvas text-xs font-bold leading-normal text-text-default outline-none transition-[border-color] shadow-inner py-2 placeholder:text-text-faint';

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

export const STATION_SCAN_BAR_RIGHT_SLOT_CLASS =
  'absolute right-2 top-1/2 z-dropdown isolate flex max-w-[55%] -translate-y-1/2 items-center gap-1';

/** Frosted-glass chip rail — sits over the input; hairline ring only (no drop
 *  shadow) so the scan band stays flush chrome and does not compete with the
 *  elevated work canvas. Unbox / Testing / Shipping share this shell. */
export const STATION_SCAN_BAR_FLOAT_RAIL_CLASS =
  'rounded-lg border border-border-hairline/80 bg-surface-card/50 px-1 py-0 ring-1 ring-inset ring-white/40 backdrop-blur-md backdrop-saturate-150';

/** Narrower right inset when mode rails / spinners sit inside the bar. */
export const STATION_SCAN_BAR_RIGHT_CONTENT_CLASS = 'right-1.5 gap-1';

export const STATION_SCAN_BAR_MODE_BTN =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-emphasis/60';

export const STATION_SCAN_BAR_MODE_BTN_COMPACT =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-emphasis/60';

/** Idle mode icon — no solid chip; the glass rail carries the surface. */
export const STATION_SCAN_BAR_MODE_BTN_INACTIVE =
  'relative z-base text-text-soft hover:text-text-muted';

/** Armed mode — inset ring so it never bleeds over sibling chips. */
export const STATION_SCAN_BAR_MODE_BTN_ARMED =
  'relative z-dropdown bg-surface-card/80 backdrop-blur-sm ring-1 ring-inset ring-current/40';

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
