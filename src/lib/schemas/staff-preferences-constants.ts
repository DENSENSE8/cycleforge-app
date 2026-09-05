/**
 * Staff-preference CONSTANTS — the plain values and pure helpers, with no
 * validation library behind them.
 *
 * They used to live in `schemas/staff-preferences.ts` next to the Zod body that
 * validates the same preferences. That module imports `zod`, and these constants
 * are read from places that have nothing to do with parsing a request — most
 * consequentially `lib/time-format/store.ts`, which `utils/date.ts` imports,
 * which is imported by anything that renders a timestamp. So formatting a date
 * anywhere pulled the entire Zod library into the client bundle: 315KB raw /
 * ~80KB compressed, the single largest chunk on `/m/home`'s critical path, on
 * every route in the app.
 *
 * Keep this file free of `zod` (and of anything that imports it). The schema
 * module re-exports everything here, so existing importers are unaffected and
 * server-side validation is unchanged.
 */
import { THEME_NAMES, type ThemeName } from '@/design-system/themes/registry';
import {
  DEFAULT_STATION_DEPTH,
  STATION_DEPTH_NAMES,
  type StationDepthName,
} from '@/design-system/themes/station-depths';
import {
  DEFAULT_STATION_SKIN,
  STATION_SKIN_NAMES,
  type StationSkinName,
} from '@/design-system/themes/station-skins';

/**
 * Keys that reclaim focus even while an editable field is focused — warehouse
 * classics a barcode wedge can emit without colliding with typed text.
 * Printable / named keys outside this set are still bindable, but the global
 * listener yields over inputs (see `isEditableKeyTarget`).
 */
export const FOCUS_SCAN_ALWAYS_AVAILABLE_RE =
  /^(Insert|ScrollLock|F([1-9]|1[0-2]))$/;

/** Modifier / cancel / dead keys — never a reclaim binding. */
const FOCUS_SCAN_RESERVED_KEYS = new Set([
  'Escape',
  'Meta',
  'Control',
  'Alt',
  'Shift',
  'Dead',
  'Unidentified',
  'Process',
  'Compose',
]);

/**
 * True when `key` (`KeyboardEvent.key`) may be stored as the focus-scan reclaim
 * binding. Any non-reserved key is allowed; always-available keys keep working
 * mid-field, others yield while typing.
 */
export function isBindableFocusScanHotkey(key: string): boolean {
  if (!key || key.length > 32) return false;
  if (FOCUS_SCAN_RESERVED_KEYS.has(key)) return false;
  return true;
}

/**
 * Preset chips in Settings — classic non-typing keys. Operators can also capture
 * any other bindable key via the scan-bar gear or Settings “Press a key…”.
 */
export const FOCUS_SCAN_HOTKEY_OPTIONS: readonly string[] = [
  'Insert',
  'ScrollLock',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
];

/** Default binding when a staffer has never customized it. */
export const DEFAULT_FOCUS_SCAN_HOTKEY = 'Insert';

/**
 * Color themes — derived from the theme registry
 * (src/design-system/themes/registry.ts, the SoT), so registering a new
 * palette makes it valid here with zero schema changes. `light` is the
 * default when a staffer has never customized it.
 */
export const STAFF_THEMES = THEME_NAMES;
export type StaffTheme = ThemeName;
export const DEFAULT_THEME: StaffTheme = 'light';

/**
 * Scan-station skins — derived from the station-skin registry so a new skin
 * is valid here with zero schema edits. Industrial is the default (absence).
 */
export const STAFF_STATION_SKINS = STATION_SKIN_NAMES;
export type StaffStationSkin = StationSkinName;
export const DEFAULT_STATION_SKIN_PREF: StaffStationSkin = DEFAULT_STATION_SKIN;

/**
 * Scan-station depth — derived from the station-depth registry. Mill is the
 * default (absence of `data-station-depth`). Independent of Color (`stationSkin`).
 */
export const STAFF_STATION_DEPTHS = STATION_DEPTH_NAMES;
export type StaffStationDepth = StationDepthName;
export const DEFAULT_STATION_DEPTH_PREF: StaffStationDepth = DEFAULT_STATION_DEPTH;

/**
 * Clock display format for every timestamp the app renders. `12h` = h:mm AM/PM
 * (the historical default — existing users are unaffected); `24h` = HH:mm.
 * A personal display preference stored per-account (cross-device), mirrored to
 * localStorage for flash-free reads; see src/lib/time-format/store.ts. Storage /
 * API timestamp formats never change — this is display-only.
 */
export const TIME_FORMAT_VALUES = ['12h', '24h'] as const;
export type TimeFormat = (typeof TIME_FORMAT_VALUES)[number];
export const DEFAULT_TIME_FORMAT: TimeFormat = '12h';

/** `#RRGGBB` personal accent override when `useStaffAccent` is false. */
export const ACCENT_HEX_RE = /^#[0-9a-fA-F]{6}$/;
