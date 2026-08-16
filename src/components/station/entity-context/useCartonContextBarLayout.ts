'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export type CartonContextActionId = 'listing' | 'claim' | 'photos';

/**
 * Responsive layout for {@link CartonContextCard}'s one-row chrome — classify
 * pills collapse to dot-only / shortLabel faces and trailing verbs park in `⋯`
 * before the bar wraps.
 */
export function useCartonContextBarLayout(barRef: RefObject<HTMLElement | null>) {
  const [classifyCompact, setClassifyCompact] = useState(false);
  const [overflowActions, setOverflowActions] = useState<CartonContextActionId[]>([]);
  const lastWidth = useRef(0);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const apply = (width: number) => {
      lastWidth.current = width;
      setClassifyCompact(width < 760);
      setOverflowActions(
        width < 520
          ? ['listing', 'claim', 'photos']
          : width < 580
            ? ['claim', 'photos']
            : width < 640
              ? ['photos']
              : [],
      );
    };

    apply(bar.clientWidth);
    const ro = new ResizeObserver(() => {
      const width = bar.clientWidth;
      if (width === lastWidth.current) return;
      apply(width);
    });
    ro.observe(bar);
    return () => ro.disconnect();
  }, [barRef]);

  return { classifyCompact, overflowActions };
}
