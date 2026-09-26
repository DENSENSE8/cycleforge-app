'use client';

import { useEffect, type RefObject } from 'react';

/** Translates the mouse wheel's vertical delta into horizontal scroll on the target element — the convention chip strips / breadcrumb rails… */
export function useHorizontalWheelScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  reattachKey?: unknown,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      // Trackpad already gave us a horizontal delta — let the native behavior run.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // Nothing to scroll horizontally.
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [ref, reattachKey]);
}
