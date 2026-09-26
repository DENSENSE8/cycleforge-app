'use client';

import { useEffect, useState } from 'react';

/** Flips to `true` once the browser goes idle after first paint (or after `timeout` ms, whichever comes first). */
export function useIdleReady(timeout = 2_000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const flip = () => {
      if (!cancelled) setReady(true);
    };
    // Prefer requestIdleCallback when present. Avoid `'x' in window` narrowing —
    // lib.dom always declares ric, so the false branch would type `window` as never.
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(flip, { timeout });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = window.setTimeout(flip, Math.min(timeout, 500));
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [timeout]);

  return ready;
}
