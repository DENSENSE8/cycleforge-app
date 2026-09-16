'use client';

/**
 * Dev-mode assertion that a band's height NEVER moves after mount.
 *
 * Static analysis cannot prove a React tree has constant height — it can only
 * catch the causes somebody already thought of. This measures the real element
 * and fails the first time the number changes, which catches the cause nobody
 * thought of.
 *
 * The law it enforces is `slot-table-action-bar-law.ts`
 * (operator 2026-09-15: *"the action buttons bar should not expand or collapse
 * in height from clicking on an action"*).
 *
 * ## Why it only runs outside production
 *
 * A `ResizeObserver` per mounted band is cheap but not free, and in production
 * the honest response to a height change is not a console error — it is the
 * clipping the band's `overflow-hidden` already produces. This exists to make
 * the mistake loud while somebody is in a position to fix it: the dev server,
 * a Playwright run, and `NODE_ENV=test`.
 *
 * ## Why it warns rather than throws
 *
 * Throwing from a `ResizeObserver` callback unmounts the surrounding tree, so a
 * geometry bug would become a blank desk — a worse failure than the one being
 * reported, and one that hides the report. It logs with the measured before /
 * after so the diff is actionable, and the e2e guard asserts on the message.
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
            'see src/lib/tables/slot-table-action-bar-law.ts. Common causes: a TextField ' +
            '(h-11), a conditionally rendered control, or flex-wrap on the band.',
        );
        return;
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, label, expectedPx, tolerancePx]);
}
