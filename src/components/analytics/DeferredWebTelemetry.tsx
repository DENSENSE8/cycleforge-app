'use client';

/**
 * Vercel Analytics + Speed Insights, mounted only once the page has finished
 * loading and the main thread is idle.
 *
 * Both components inject a script tag as soon as they mount, which put
 * `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` into the
 * document's initial load — two extra connections and two more scripts to
 * evaluate, competing with the bundle the page needs in order to paint. On the
 * mobile profile they were measured landing at 2.8–4.1s, inside the window that
 * decides LCP.
 *
 * Neither one measures anything before load: Analytics reports a pageview, Speed
 * Insights reports web vitals that are collected by the browser regardless of
 * when its reporter attaches. So deferring costs no data and takes both off the
 * critical path.
 */

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
