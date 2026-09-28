'use client';

import { useEffect, useRef } from 'react';

/** Tiny bus: anything (header chip, `N` key) asks the record's note composer for focus. */
const listeners = new Map<number, Set<() => void>>();

export function requestOrderNoteFocus(orderId: number): void {
  listeners.get(orderId)?.forEach((fn) => fn());
}

/** Register `focus` as this order's note-focus target while mounted. */
export function useOrderNoteFocus(orderId: number, focus: () => void): void {
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  useEffect(() => {
    const fn = () => focusRef.current();
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
