/**
 * Horizontal overflow metrics for LedgerGrid scroll affordances.
 *
 * Pure numbers → start/end flags. LedgerGrid toggles
 * `cf-grid-overflow-start` / `cf-grid-overflow-end` (and keeps
 * `cf-grid-scrolled` in sync for the frozen-edge shadow). Threshold absorbs
 * sub-pixel / rubber-band noise at either end — same idea as
 * {@link moreBelowFromMetrics}.
 */

export interface GridOverflowX {
  overflowStart: boolean;
  overflowEnd: boolean;
}

/**
 * Pure metrics → "more content off the start / end edge" for h-scroll.
 * When content fits the port, both flags are false (no shadows).
 */
export function overflowXFromMetrics(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  thresholdPx = 2,
): GridOverflowX {
  if (scrollWidth <= clientWidth + thresholdPx) {
    return { overflowStart: false, overflowEnd: false };
  }
  return {
    overflowStart: scrollLeft > thresholdPx,
    overflowEnd: scrollLeft + clientWidth < scrollWidth - thresholdPx,
  };
}

/**
 * Apply overflow class names on the grid surface from a scroll element's metrics.
 * `surface` may be the scrollport itself (self-scroll) or the outer shell
 * (split-x — classes live on `[data-cf-grid]`, scroll lives on the inner body).
 */
export function applyGridOverflowXClasses(
  surface: HTMLElement,
  scrollEl: HTMLElement,
  thresholdPx = 2,
): GridOverflowX {
  const flags = overflowXFromMetrics(
    scrollEl.scrollLeft,
    scrollEl.clientWidth,
    scrollEl.scrollWidth,
    thresholdPx,
  );
  surface.classList.toggle('cf-grid-overflow-start', flags.overflowStart);
  surface.classList.toggle('cf-grid-overflow-end', flags.overflowEnd);
  // Frozen-edge shadow (identity pane) — same predicate as overflowStart.
  surface.classList.toggle('cf-grid-scrolled', flags.overflowStart);
  return flags;
}
