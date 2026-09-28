'use client';

import { useEffect, type RefObject } from 'react';

/** Pixels per wheel "line" when the browser reports `deltaMode === 1` (Firefox mouse wheels). */
const LINE_PX = 16;

/**
 * Translates the plain mouse wheel's vertical delta into horizontal scroll on a
 * sideways rail — pill / chip strips, step trails, breadcrumb rails — so a mouse
 * without a tilt wheel scrolls them without holding Shift (owner 2026-09-28).
 *
 * - A trackpad's own horizontal gesture passes through untouched.
 * - At either end the wheel is released to the page, so a rail under the
 *   cursor never traps vertical scrolling.
 */
export function useHorizontalWheelScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  reattachKey?: unknown,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const delta = e.deltaMode === 1 ? e.deltaY * LINE_PX : e.deltaY;
      if (delta === 0) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      if ((delta < 0 && el.scrollLeft <= 0) || (delta > 0 && el.scrollLeft >= max - 1)) return;
      e.preventDefault();
      el.scrollLeft += delta;
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [ref, reattachKey]);
}
