import { useMemo } from 'react';
import {
  getStaffThemeById,
  getPackerInputTheme,
  stationThemeColors,
  type StationTheme,
  type StationThemeColors,
  type StationInputThemeClasses,
} from '@/utils/staff-colors';
import { STATION_SCAN_BAR_BOTTOM_RULE_CLASS } from '@/components/station/scan-bar/tokens';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { useAuth } from '@/contexts/AuthContext';
import { operatorAccentClasses } from '@/utils/operator-accent';

export type { StationTheme, StationThemeColors, StationInputThemeClasses };
export { operatorAccentClasses };

export interface ResolvedTheme {
  /** The resolved theme key (e.g. 'purple', 'green', 'black'). */
  theme: StationTheme;
  /** Core color classes: bg, hover, light, border, text, shadow. */
  colors: StationThemeColors;
  /** Scan input bottom-rule chrome for this theme. */
  inputBorder: string;
  /** Packer-style input classes (text, bg, ring, border). Always populated. */
  inputTheme: StationInputThemeClasses;
}

interface StaffInput {
  staffId: number | string | null | undefined;
}

const dynamicThemeColors: StationThemeColors = {
  bg: operatorAccentClasses.bg,
  hover: operatorAccentClasses.hover,
  light: 'bg-accent-light',
  border: 'border-accent-border',
  text: 'text-accent-text',
  shadow: 'shadow-accent-shadow',
};

/**
 * Single entry point for station theme resolution.
 *
 * @example
 *   // From a known theme string
 *   const { theme, colors } = useStationTheme('purple');
 *
 * @example
 *   // From a staff ID — resolves dynamically via staff-colors lookup tables
 *   const { theme, colors, inputBorder } = useStationTheme({ staffId: 3 });
 */
export function useStationTheme(input: StationTheme | StaffInput): ResolvedTheme {
  // Re-resolve when the module-level color cache flips (localStorage hydration
  // on cold boot + the fresh /api/staff fetch from StaffColorsProvider).
  const colorVersion = useStaffColorVersion();
  const { user } = useAuth();

  return useMemo(() => {
    const theme: StationTheme =
      typeof input === 'string'
        ? input
        : getStaffThemeById(input.staffId);

    // If resolving theme for the current logged-in operator, use dynamic variables
    const isSelf =
      typeof input !== 'string' &&
      input.staffId != null &&
      user?.staffId != null &&
      Number(input.staffId) === Number(user.staffId);

    if (isSelf) {
      return {
        theme,
        colors: dynamicThemeColors,
        inputBorder: STATION_SCAN_BAR_BOTTOM_RULE_CLASS[theme],
        inputTheme: getPackerInputTheme(theme),
      };
    }

    return {
      theme,
      colors: stationThemeColors[theme],
      inputBorder: STATION_SCAN_BAR_BOTTOM_RULE_CLASS[theme],
      inputTheme: getPackerInputTheme(theme),
    };
  }, [
    typeof input === 'string' ? input : input.staffId,
    colorVersion,
    user?.staffId,
  ]);
}
