'use client';

import { AnimatePresence, motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { Loader2, RefreshCw } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import type { SendToDeviceState } from '@/lib/realtime/device-handshake';

/**
 * **The send-to-device waiting state — one face for every Station bench.**
 *
 * Replaces the optimistic "Sent to phone" toast. That toast reported that the
 * desk had *spoken*; this reports whether a phone *answered*, which is the fact
 * the operator needs before they put the carton down and pick up the phone.
 *
 * House grammar, deliberately matching `UnitPhotoRequestStatus` (the existing
 * testing-bench status line): a small state dot / glyph, one short sentence, and
 * an action only when there is something to do. It is ambient chrome on the
 * active-entity card, not an interrupt — the scan bar keeps focus throughout.
 *
 * Presentational: takes a state and two callbacks, imports no channel and no
 * Ably. Receiving and Pack mount the identical component, which is the D2
 * requirement (same UX on both) expressed as code rather than as a convention.
 */

const COPY: Record<Exclude<SendToDeviceState, 'idle'>, string> = {
  request_sent: 'Waiting on phone…',
  peer_active: 'Open on your phone',
  // Names the fix, not just the fault: the overwhelmingly common cause is a
  // phone that is locked, backgrounded, or signed into a different account.
  timed_out: 'Phone unreachable',
};

const TONE: Record<Exclude<SendToDeviceState, 'idle'>, string> = {
  request_sent: 'border-border-soft text-text-muted',
  peer_active: 'border-emerald-200 text-emerald-700',
  timed_out: 'border-amber-200 text-amber-800',
};

export function SendToDeviceStatus({
  state,
  onRetry,
  className,
}: {
  state: SendToDeviceState;
  onRetry: () => void;
  className?: string;
}) {
  const presence = useMotionPresence(framerPresence.composerDock);
  const transition = useMotionTransition(framerTransition.composerDockMount);

  const visible = state !== 'idle';

  return (
    // Outside the conditional so the exit can actually play (motion-crossfade.md).
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="send-to-device-status"
          initial={presence.initial}
          animate={presence.animate}
          exit={presence.exit}
          transition={transition}
          role="status"
          aria-live="polite"
          data-send-to-device-state={state}
          className={[
            'flex items-center gap-2 rounded-lg border bg-surface-card inset-field',
            TONE[state as Exclude<SendToDeviceState, 'idle'>],
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {state === 'request_sent' ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                state === 'peer_active' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          )}

          <p className="min-w-0 flex-1 truncate text-role-caption font-semibold">
            {COPY[state as Exclude<SendToDeviceState, 'idle'>]}
          </p>

          {state === 'timed_out' ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetry}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              className="shrink-0"
            >
              Retry
            </Button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
