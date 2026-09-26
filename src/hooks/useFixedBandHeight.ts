'use client';

/**
 * Dev-mode assertion that a band's height NEVER moves after mount.
 * (operator 2026-09-15: *"the action buttons bar should not expand or collapse
 */

import { useEffect, type RefObject } from 'react';

export interface FixedBandHeightOptions {
  /** Names the band in the failure message ("Stock action bar"). */
  label: string;
  /** The height the band declares. A drift from this is itself a failure. */
  expectedPx: number;
  /**
   * Sub-pixel slack. Browser zoom and fractional device pixel ratios make a
   * 40px band measure 39.99; one pixel of tolerance keeps the guard honest
   * without making it noisy.
   */
  tolerancePx?: number;
}

/** The exact prefix the e2e guard greps for. Changing it breaks that assertion. */
export const FIXED_BAND_HEIGHT_VIOLATION = '[fixed-band-height]' as const;

export function useFixedBandHeight(
  ref: RefObject<HTMLElement | null>,
  { label, expectedPx, tolerancePx = 1 }: FixedBandHeightOptions,
): void {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    let reported = false;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const measured = entry.contentRect.height + 0; // px, fractional
        const drift = Math.abs(measured - expectedPx);
        if (drift <= tolerancePx) continue;
        // Report ONCE per mount. A band that resizes usually resizes on every
        // keystroke, and a thousand identical lines buries the first one.
        if (reported) return;
        reported = true;
        console.error(
          `${FIXED_BAND_HEIGHT_VIOLATION} ${label} measured ${measured.toFixed(2)}px but ` +
            `declares ${expectedPx}px. A control in this band is sizing it from content — ` +
            'Common causes: a TextField ' +
            '(h-11), a conditionally rendered control, or flex-wrap on the band.',
        );
        return;
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, label, expectedPx, tolerancePx]);
}
