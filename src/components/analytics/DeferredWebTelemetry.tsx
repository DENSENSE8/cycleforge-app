'use client';

/** Vercel Analytics + Speed Insights, mounted only once the page has finished loading and the main thread is idle. */

import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

export function DeferredWebTelemetry() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let idle: number | undefined;
    const schedule = () => {
      const ric = window.requestIdleCallback;
      idle = ric
        ? ric(() => setReady(true), { timeout: 4000 })
        : window.setTimeout(() => setReady(true), 1500);
    };

    if (document.readyState === 'complete') {
      schedule();
      return () => {
        if (idle != null) window.cancelIdleCallback?.(idle);
      };
    }
    window.addEventListener('load', schedule, { once: true });
    return () => {
      window.removeEventListener('load', schedule);
      if (idle != null) window.cancelIdleCallback?.(idle);
    };
  }, []);

  if (!ready) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
