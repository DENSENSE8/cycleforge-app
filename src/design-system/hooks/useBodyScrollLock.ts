'use client';

import { useEffect } from 'react';

/** Locks `document.body` scrolling while `active` is true, restoring the previous value on cleanup. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
