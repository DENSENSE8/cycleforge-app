'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { resolveClassifyCompact } from './carton-context-bar-layout';

export type CartonContextActionId = 'listing' | 'claim' | 'photos';

/**
 * Responsive layout for {@link CartonContextCard}'s one-row chrome — classify
 * pills collapse to dot-only / shortLabel faces when they collide with
 * identity or actions, and trailing verbs park in `⋯` before the bar wraps.
 */
export function useCartonContextBarLayout(barRef: RefObject<HTMLElement | null>) {
  const [classifyCompact, setClassifyCompact] = useState(false);
  const [overflowActions, setOverflowActions] = useState<CartonContextActionId[]>([]);
  const compactRef = useRef(false);
  const labelWidthRef = useRef(0);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const apply = (width: number) => {
      setOverflowActions(
        width < 520
          ? ['listing', 'claim', 'photos']
          : width < 580
            ? ['claim', 'photos']
            : width < 640
              ? ['photos']
              : [],
      );

      const identity = bar.querySelector<HTMLElement>('[data-carton-bar-slot="identity"]');
      const classify = bar.querySelector<HTMLElement>('[data-carton-bar-slot="classify"]');
      const actions = bar.querySelector<HTMLElement>('[data-carton-bar-slot="actions"]');
      if (!identity || !classify || !actions) {
        compactRef.current = false;
        setClassifyCompact(false);
        return;
      }

      const classifyContentWidth = classify.offsetWidth;
      if (!compactRef.current) labelWidthRef.current = classifyContentWidth;

      const next = resolveClassifyCompact({
        barWidth: width,
        identityWidth: identity.offsetWidth,
        classifyContentWidth,
        actionsWidth: actions.offsetWidth,
        currentlyCompact: compactRef.current,
        labelClassifyWidth: labelWidthRef.current,
      });
      if (next === compactRef.current) return;
      compactRef.current = next;
      setClassifyCompact(next);
    };

    apply(bar.clientWidth);
    const ro = new ResizeObserver(() => {
      apply(bar.clientWidth);
    });
    ro.observe(bar);
    const classifyEl = bar.querySelector('[data-carton-bar-slot="classify"]');
    if (classifyEl) ro.observe(classifyEl);
    return () => ro.disconnect();
  }, [barRef]);

  return { classifyCompact, overflowActions };
}
