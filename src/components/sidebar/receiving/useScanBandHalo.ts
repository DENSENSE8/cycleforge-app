'use client';

/**
 * Station-theme gradient fills for the scan-band glow layer.
 * Opacity / enter-exit is owned by {@link ScanBandGlowHost} + motion catalog
 * (`framerTransition.scanBandGlow` / `scanBandGlowPulse`).
 */

import type { StationTheme } from '@/hooks/useStationTheme';

/** Bottom-up staff-tint gradient (no opacity — Framer owns that). */
const BAND_GLOW_GRADIENT: Record<StationTheme, string> = {
  green: 'bg-gradient-to-t from-emerald-500/20 via-emerald-50/50 to-white',
  blue: 'bg-gradient-to-t from-blue-500/20 via-blue-50/50 to-white',
  purple: 'bg-gradient-to-t from-purple-500/20 via-purple-50/50 to-white',
  yellow: 'bg-gradient-to-t from-amber-500/20 via-amber-50/50 to-white',
  black: 'bg-gradient-to-t from-slate-700/20 via-slate-50/50 to-white', // ds-allow-raw-neutral: identity hue — staff vocabulary
  red: 'bg-gradient-to-t from-red-500/20 via-red-50/50 to-white',
  lightblue: 'bg-gradient-to-t from-sky-500/20 via-sky-50/50 to-white',
  pink: 'bg-gradient-to-t from-pink-500/20 via-pink-50/50 to-white',
};

/** Gradient class for the Framer glow overlay. */
export function scanBandGlowGradientClass(themeColor: StationTheme): string {
  return BAND_GLOW_GRADIENT[themeColor];
}
