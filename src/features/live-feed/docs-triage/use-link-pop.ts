'use client';

/**
 * A document mark pops when its document links (operator 2026-10-06: a mark
 * pops green on link). `linked` going false → true under a mounted mark
 * scales it up and back once; first paint, unlinking and reduced motion stay
 * still. Spread the result on a `motion.*` element INSIDE the mark's button
 * (never remount the button itself — focus stays put).
 */

import { useEffect, useRef } from 'react';
import { useAnimationControls, useReducedMotion } from 'motion/react';
import { motionBezier } from '@/design-system/foundations/motion-presets';

export function useLinkPop(linked: boolean) {
  const controls = useAnimationControls();
  const reduce = useReducedMotion();
  const was = useRef(linked);
  useEffect(() => {
    const before = was.current;
    was.current = linked;
    if (reduce || before || !linked) return;
    void controls.start({ scale: [1, 1.45, 1], transition: { duration: 0.28, ease: motionBezier.easeOut } });
  }, [linked, reduce, controls]);
  return { animate: controls };
}
