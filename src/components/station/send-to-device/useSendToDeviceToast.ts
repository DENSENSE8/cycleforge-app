'use client';

/** Presentational layer for {@link useSendToDevice} — the phone-handshake status ("Waiting on phone…" / "Open on your phone" / "Phone… */

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
