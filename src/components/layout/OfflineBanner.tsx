'use client';

import { useConnectionChrome } from '@/hooks/useConnectionHealth';

const TONE_CLASS = {
  danger: 'bg-rose-600 text-white',
  warning: 'bg-amber-600 text-white',
  success: 'bg-emerald-600 text-white',
} as const;

/**
 * The global connection banner. Mounted once near the app root — this is the
 * source-of-truth PLACEMENT for connection state; `mobile/OfflineBanner` is the
 * phone-shell placement of the same answer, and the Operations TV board renders
 * it read-only at wall scale (D12). There is no fourth banner: the dead
 * `station/OfflineBanner` was deleted with this change.
 *
 * It reports three different problems and keeps them distinguishable:
 * device offline · realtime link paused · edits still draining. Which one wins,
 * the operator copy, and the debounce that keeps a routine Ably reconnect from
 * flashing the band all live in `@/lib/realtime/connection-health` (pure +
 * unit-tested) — this component only paints the answer.
 *
 * Deliberately un-animated: it is a status band on the app frame, not a station
 * card, and a slide-in on a surface that can appear during a scan is motion the
 * operator did not ask for.
 */
export function OfflineBanner() {
  const chrome = useConnectionChrome();

  if (chrome.kind === 'hidden') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-connection-state={chrome.kind}
      className={/* ds-allow-spacing — safe-area inset */ `fixed inset-x-0 top-0 z-banner px-3 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top,0px))] text-center text-role-caption font-semibold uppercase tracking-widest ${TONE_CLASS[chrome.tone]}`}
    >
      {chrome.message}
    </div>
  );
}
