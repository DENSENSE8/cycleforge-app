'use client';

/**
 * Presentational layer for {@link useSendToDevice} — the phone-handshake
 * status ("Waiting on phone…" / "Open on your phone" / "Phone unreachable")
 * rendered on the ONE house toast surface (`AppToaster`, bottom-right)
 * instead of an inline status card.
 *
 * Retires `SendToDeviceStatus`: a persistent card mounted above the very rows
 * it sat on (Photos Actions) or popovered under an identity pill is exactly
 * the "never reserve height a body has not asked for" anti-pattern
 * (`ui-design-system.md`) — and every consumer had to hand-roll its own
 * absolute-positioned wrapper to keep it from shoving surrounding chrome.
 *
 * `request_sent` → `peer_active` | `timed_out` update the SAME toast id in
 * place (Sonner morphs it), so the operator watches one card change state
 * rather than three stacking. This is NOT the blind "Sent to phone" toast
 * that shipped before `useSendToDevice` existed — that one fired on click and
 * only ever confirmed the desk had spoken (an Ably publish resolves with zero
 * subscribers). This toast tracks the real handshake: it stays on "Waiting…"
 * until the phone acks, then flips to answered or unreachable — with Retry
 * inline on the unreachable state, no separate button.
 *
 * Fires no render of its own — call once per `useSendToDevice()` instance and
 * mount nothing. Presentational only: imports no channel, no Ably.
 */

import { useEffect, useId } from 'react';
import { toast } from '@/lib/toast';
import type { SendToDeviceState } from '@/lib/realtime/device-handshake';

const COPY: Record<Exclude<SendToDeviceState, 'idle'>, string> = {
  request_sent: 'Waiting on phone…',
  peer_active: 'Open on your phone',
  // Names the fix, not just the fault — the overwhelmingly common cause is a
  // phone that is locked, backgrounded, or signed into a different account.
  timed_out: 'Phone unreachable',
};

export function useSendToDeviceToast(state: SendToDeviceState, onRetry: () => void): void {
  const toastId = `send-to-device-${useId()}`;

  useEffect(() => {
    if (state === 'idle') {
      // A deliberate reset (new carton, panel closed mid-wait) must not leave
      // a stale "Waiting on phone…" card on screen — dismissing an id that
      // already settled on its own is a no-op.
      toast.dismiss(toastId);
      return;
    }
    if (state === 'request_sent') {
      toast.loading(COPY.request_sent, { id: toastId });
      return;
    }
    if (state === 'peer_active') {
      toast.success(COPY.peer_active, { id: toastId });
      return;
    }
    // timed_out — amber "try again", not a hard failure.
    toast.warning(COPY.timed_out, {
      id: toastId,
      action: { label: 'Retry', onClick: onRetry },
    });
  }, [state, toastId, onRetry]);

  // Unmounting mid-wait (operator navigates away) must not leave the toast
  // spinning for its full loading-duration ceiling.
  useEffect(() => {
    return () => {
      toast.dismiss(toastId);
    };
  }, [toastId]);
}
