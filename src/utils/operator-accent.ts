/**
 * Tailwind classes for the logged-in operator's dynamic accent fill.
 *
 * Source chain (staff toggle ON, default):
 *   `staff.color_hex` → {@link getStaffThemeById} → ThemeSync `theme-*` on
 *   `<html>` → `--ds-color-accent-*` CSS vars → these utilities.
 *
 * Source chain (staff toggle OFF):
 *   `staff_preferences.accentHex` → {@link themeFromHex} → same `theme-*` path.
 *
 * Same fill as dashboard `TabSwitch` `solidTone="accent"` and
 * `useStationTheme({ staffId: self }).colors.bg`.
 */
import {
  getStaffThemeById,
  themeFromHex,
  type StationTheme,
} from '@/utils/staff-colors';

export const operatorAccentClasses = {
  bg: 'bg-accent-bg',
  hover: 'hover:bg-accent-hover',
  /** Active icon pill in SectionTabsSlider and matching workspace toggles. */
  activePill: 'bg-accent-bg shadow-sm shadow-accent-shadow/25',
} as const;

/** Default when `useStaffAccent` is absent or null — staff identity color wins. */
export const DEFAULT_USE_STAFF_ACCENT = true;

/** Fallback custom accent when the picker has never been set. */
export const DEFAULT_CUSTOM_ACCENT_HEX = '#3b82f6';

export function resolvesUseStaffAccent(
  prefs: { useStaffAccent?: boolean | null } | null | undefined,
): boolean {
  return prefs?.useStaffAccent !== false;
}

/** Resolve the `StationTheme` class ThemeSync should apply for operator accent chrome. */
export function resolveOperatorAccentTheme(
  prefs: { useStaffAccent?: boolean | null; accentHex?: string | null } | null | undefined,
  staffId: number | string | null | undefined,
): StationTheme {
  if (resolvesUseStaffAccent(prefs) && staffId != null) {
    return getStaffThemeById(staffId);
  }
  return themeFromHex(prefs?.accentHex ?? DEFAULT_CUSTOM_ACCENT_HEX);
}
