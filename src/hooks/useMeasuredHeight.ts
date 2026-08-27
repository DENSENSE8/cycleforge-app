'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Live pixel height of an element, tracked through a `ResizeObserver`.
 *
 * Written for floating chrome that must not occlude the scroll port it sits
 * over: the port reserves exactly the measured height as bottom inset, so a
 * dock whose height CHANGES (composer auto-grow, a CC strip, a presets bar,
 * staged photo thumbs) never hides the content underneath it and never leaves a
 * dead gap when it shrinks. A hardcoded `pb-28` is the bug this replaces.
 *
 * Returns a ref callback (safe across remounts — it re-observes the new node)
 * and the rounded-up height. Height is `0` until the node mounts, so a first
 * paint reserves nothing rather than jumping.
 */
export function useMeasuredHeight<T extends HTMLElement>(): [
  (node: T | null) => void,
  number,
] {
  const [height, setHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    [],
  );

  const ref = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) {
      setHeight(0);
      return;
    }
    setHeight(Math.ceil(node.getBoundingClientRect().height));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setHeight((prev) => {
        const next = Math.ceil(node.getBoundingClientRect().height);
        return next === prev ? prev : next;
      });
    });
    ro.observe(node);
    observerRef.current = ro;
  }, []);

  return [ref, height];
}
