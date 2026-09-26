/** Pack standard time — the stop list one drag control snaps to, and the tier that follows from the number. */

export type PackTier = 'SMALL' | 'MEDIUM' | 'LARGE';

/** Minute values the slider can land on. Ascending; index IS the slider value. */
export const PACK_STANDARD_MINUTE_STOPS = [1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 45, 60] as const;

/** Highest valid slider index (slider is `min=0 max=MAX_STOP_INDEX step=1`). */
export const MAX_PACK_STOP_INDEX = PACK_STANDARD_MINUTE_STOPS.length - 1;

/**
 * Tier boundaries — the MIDPOINTS between the rule-based tier defaults
 * (`DEFAULT_TIER_MINUTES` = 5 / 14 / 45), so a SKU left at a tier default lands
 * back on the same tier after a round trip through the slider.
 */
export const SMALL_MEDIUM_BOUNDARY_MINUTES = 9.5;
export const MEDIUM_LARGE_BOUNDARY_MINUTES = 29.5;

/** The tier a standard time rolls up to. The only place tier is decided. */
export function tierForMinutes(minutes: number): PackTier {
  if (minutes < SMALL_MEDIUM_BOUNDARY_MINUTES) return 'SMALL';
  if (minutes < MEDIUM_LARGE_BOUNDARY_MINUTES) return 'MEDIUM';
  return 'LARGE';
}

/** Minutes at a slider index, clamped into the stop list. */
export function minutesForStopIndex(index: number): number {
  if (!Number.isFinite(index)) return PACK_STANDARD_MINUTE_STOPS[0];
  const i = Math.min(MAX_PACK_STOP_INDEX, Math.max(0, Math.round(index)));
  return PACK_STANDARD_MINUTE_STOPS[i];
}

/**
 * Slider index for an arbitrary stored minute value — nearest stop, ties going
 * to the SMALLER stop so a legacy 14-minute MEDIUM default reads as 15 rather
 * than jumping a tier, and 4 reads as 3 rather than 5.
 */
export function stopIndexForMinutes(minutes: number | null | undefined): number {
  if (minutes == null || !Number.isFinite(minutes)) {
    return stopIndexForMinutes(PACK_STANDARD_MINUTE_STOPS[0]);
  }
  let best = 0;
  let bestGap = Math.abs(PACK_STANDARD_MINUTE_STOPS[0] - minutes);
  for (let i = 1; i <= MAX_PACK_STOP_INDEX; i += 1) {
    const gap = Math.abs(PACK_STANDARD_MINUTE_STOPS[i] - minutes);
    // Strictly-less keeps the earlier (smaller) stop on a tie.
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  }
  return best;
}

/** Snap any stored minute value onto the stop list. */
export function snapMinutes(minutes: number | null | undefined): number {
  return minutesForStopIndex(stopIndexForMinutes(minutes));
}

/** Read-out under the slider thumb: `8 min`, `1 hr`, `1 hr 30 min`. */
export function formatPackMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
