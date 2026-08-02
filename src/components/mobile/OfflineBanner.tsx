'use client';

/**
 * OfflineBanner — the MOBILE-SHELL placement of the app's connection state.
 *
 * Same answer as the global `layout/OfflineBanner`, different geometry: a phone
 * has no room for the desk band, and its shell owns its own safe area. Both read
 * `useConnectionChrome()`, so the two can no longer disagree about whether the
 * device is offline, the realtime link is paused, or edits are still draining —
 * which is exactly what four independent `navigator.onLine` listeners used to
 * guarantee they would.
 *
 * Slides down, stays while the problem holds, and shows a brief "Back online"
 * confirmation on recovery (the recovery beat is owned by the shared hook, so a
 * cold load never flashes it).
 */

import { AnimatePresence, motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { Wifi, WifiOff } from '@/components/Icons';
import { useConnectionChrome } from '@/hooks/useConnectionHealth';

const TONE_CLASS = {
  danger: 'bg-rose-600 text-white',
  warning: 'bg-amber-600 text-white',
  success: 'bg-emerald-600 text-white',
} as const;

export function OfflineBanner() {
  const chrome = useConnectionChrome();
  const presence = useMotionPresence(framerPresence.stationCard);
  const transition = useMotionTransition(framerTransition.stationCardMount);

  const visible = chrome.kind !== 'hidden';
  // `offline` is the only state where the device genuinely has no link; a paused
  // realtime link or a draining queue still has one, so they keep the Wifi mark.
  const Icon = chrome.kind === 'offline' ? WifiOff : Wifi;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key={chrome.kind}
          {...presence}
          transition={transition}
          role="status"
          aria-live="polite"
          data-connection-state={chrome.kind}
          className={`fixed inset-x-0 top-0 z-banner ${TONE_CLASS[chrome.tone]}`}
          /* ds-allow-spacing — safe-area inset */
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center justify-center gap-2 px-4 py-2 text-role-micro font-semibold uppercase tracking-widest">
            <Icon className="h-4 w-4" />
            <span>{chrome.message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
