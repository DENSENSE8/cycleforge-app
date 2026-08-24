'use client';

import { useEffect, useState } from 'react';

/**
 * Flips to `true` once the browser goes idle after first paint (or after
 * `timeout` ms, whichever comes first). Gate non-critical mount work on this —
 * app-wide seed fetches, analytics warmups, prefetch caches — so it never
 * competes with the route's first render for main-thread time.
 *
 * SSR/first render always return `false`, so gated effects run exactly once
 * on the idle flip. Falls back to `setTimeout` where `requestIdleCallback`
 * is unavailable (Safari).
 */
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
