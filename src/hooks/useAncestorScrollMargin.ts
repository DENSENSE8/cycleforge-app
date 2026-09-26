'use client';

import { useEffect, useState, type RefObject } from 'react';

/** `useAncestorScrollMargin` — the measurement half of the "multiple virtualized lists share ONE scroll region" pattern (TanStack Virtual's… */
export function useAncestorScrollMargin({
  enabled,
  scrollParentRef,
  innerRef,
  deps = [],
}: {
  /** True only when embedded in a shared ancestor scroll region (stacked lane). */
  enabled: boolean;
  /** The shared scrolling ancestor (the board's scroll region). */
  scrollParentRef: RefObject<HTMLElement | null>;
  /** This list's inner (position:relative, height=totalSize) wrapper. */
  innerRef: RefObject<HTMLElement | null>;
  /** Re-measure when the list's own content changes (grouping/day bands). */
  deps?: unknown[];
}): number {
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setScrollMargin((prev) => (prev === 0 ? prev : 0));
      return;
    }
    const scrollEl = scrollParentRef.current;
    const inner = innerRef.current;
    if (!scrollEl || !inner) return;

    let raf = 0;
    const measure = () => {
      raf = 0;
      const next = Math.max(
        0,
        Math.round(
          inner.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop,
        ),
      );
      setScrollMargin((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    scrollEl.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(scrollEl);
    ro.observe(inner);
    // A sibling lane above changing height shifts this list down; observe the
    // scroll region's content wrapper so those reflows recompute the margin too.
    const content = scrollEl.firstElementChild;
    if (content) ro.observe(content);
    window.addEventListener('resize', schedule);

    return () => {
      scrollEl.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
    // `deps` lets the caller re-run on its own content change (day bands); the
    // ref objects are stable identities, so spreading caller deps is intentional.
  }, [enabled, scrollParentRef, innerRef, ...deps]);

  return enabled ? scrollMargin : 0;
}
