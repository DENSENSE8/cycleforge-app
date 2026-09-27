'use client';

import { useEffect, useState, type RefObject } from 'react';
import Lenis from 'lenis';
import { usePointerFine, useReducedMotion } from '@/design-system/motion';

/**
 * Smooth wheel scrolling for the Daily agenda's list — and nothing else.
 *
 * Lenis is scoped to the ledger's own scroller (`wrapper` mode), never the
 * window: every other page, and every table outside this list, keeps native
 * scroll. It is off under reduced motion and on anything without a fine
 * pointer (touch keeps the platform's own momentum).
 *
 * The scroller is virtualized and its content element swaps between the
 * loading, empty and list states, so the scroll limit is read live
 * (`naiveDimensions`) rather than from a ResizeObserver pinned to one child.
 * Keyboard, `scrollTo` from the virtualizer (J/K, an opened record) and the
 * scrollbar stay native; Lenis follows them through the scroll event. A key
 * pressed while a wheel glide is still in flight drops the glide first, so
 * that glide cannot overwrite the key's own scroll on its next frame.
 */
export function useDailySmoothScroll(wrapperRef: RefObject<HTMLElement | null>): void {
  const reduceMotion = useReducedMotion();
  const pointerFine = usePointerFine();

  // The ledger (and its scroller) unmounts while the composer is open; pick up
  // whichever element the ref holds after each commit. Equal values bail out.
  const [wrapper, setWrapper] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setWrapper(wrapperRef.current);
  });

  useEffect(() => {
    if (!wrapper || reduceMotion || !pointerFine) return;

    const lenis = new Lenis({
      wrapper,
      content: wrapper,
      autoRaf: false,
      autoResize: false,
      naiveDimensions: true,
      lerp: 0.1,
      smoothWheel: true,
    });

    let frame = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // stop() + start() is Lenis's public way to drop a glide and resync to the
    // element's real scrollTop.
    const onKeyDown = () => {
      if (lenis.isScrolling !== 'smooth') return;
      lenis.stop();
      lenis.start();
    };
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [wrapper, reduceMotion, pointerFine]);
}
