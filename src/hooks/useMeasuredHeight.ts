'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Live pixel height of an element, tracked through a `ResizeObserver`. */
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
