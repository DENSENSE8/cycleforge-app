import { after } from 'next/server';

/**
 * Schedule work that must outlive the HTTP response — and, on local Node,
 * must not hold the response open until Zoho finishes.
 *
 * Next `after()` on Vercel uses `waitUntil` and flushes the response first.
 * On `next dev` / `next start`, `after` historically *awaits* the callback
 * before flushing — so Unbox's 30s `AbortSignal.timeout` races the Zoho
 * purchase-receive chain and aborts mid-flight as a "network timeout".
 *
 * - Vercel: return the promise from `after` so waitUntil keeps the isolate alive.
 * - Local: fire-and-forget inside `after` so the callback settles immediately,
 *   the 200 flushes, and the Node process keeps the detached promise running.
 */
export function scheduleAfterResponse(work: () => Promise<void>): void {
  const run = () =>
    work().catch((err) => {
      console.error('scheduleAfterResponse failed', err);
    });

  if (process.env.VERCEL === '1') {
    after(run);
    return;
  }

  after(() => {
    void run();
  });
}
