'use client';

import { useEffect, useRef } from 'react';

/** Tiny bus: the record's `P` key asks the record's Photos door to open this order's photos. */
const listeners = new Map<number, Set<() => void>>();

/** Open this order's photos in the viewer. */
export function requestOrderPhotos(orderId: number): void {
  listeners.get(orderId)?.forEach((fn) => fn());
}

/** Register `open` as this order's photo viewer while mounted. */
export function useOrderPhotosRequest(orderId: number, open: () => void): void {
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const fn = () => openRef.current();
    let set = listeners.get(orderId);
    if (!set) {
      set = new Set();
      listeners.set(orderId, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) listeners.delete(orderId);
    };
  }, [orderId]);
}
