'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAblyClient } from '@/contexts/AblyContext';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  sendToDevice,
  type DeviceAckChannel,
  type DeviceAckKind,
  type SendToDeviceState,
} from '@/lib/realtime/device-handshake';

/**
 * React binding for the desk-side send-to-device handshake.
 *
 * Owns the `idle → request_sent → peer_active | timed_out` machine and nothing
 * else: the *publish* stays with the caller, because each bench sends a
 * different payload on a different channel (receiving's stage-routed photo
 * request vs. pack's `scan_ready`). What must be identical across benches is
 * the waiting, the timeout, and what the operator is told — and that is exactly
 * what lives here.
 *
 * The caller receives the minted `requestId` and MUST put it on the wire, or
 * the phone's ack carries an id the desk is not waiting on and every send reads
 * as unreachable.
 */

/** How long a successful "On your phone" confirmation rests before clearing. */
const PEER_ACTIVE_SETTLE_MS = 4_000;

interface SendToDeviceOptions {
  /** Ably channel the ACK will arrive on — the same bridge the request goes out on. */
  channelName: string;
  /** Publish the request. Receives the minted id; it must reach the wire. */
  publish: (requestId: string) => Promise<void>;
}

interface SendToDeviceModel {
  state: SendToDeviceState;
  /** True while a request is out and unanswered — for disabling the trigger. */
  pending: boolean;
  send: (opts: SendToDeviceOptions) => Promise<boolean>;
  /** Re-send the last request. No-op before a first send. */
  retry: () => void;
  reset: () => void;
}

export function useSendToDevice(kind: DeviceAckKind): SendToDeviceModel {
  const { getClient } = useAblyClient();
  const [state, setState] = useState<SendToDeviceState>('idle');
  const lastRef = useRef<SendToDeviceOptions | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const send = useCallback(
    async (opts: SendToDeviceOptions): Promise<boolean> => {
      lastRef.current = opts;
      if (!opts.channelName) {
        // No channel means no pairing gate — the phone leg cannot exist. Report
        // it as unreachable rather than leaving the operator on "Waiting…".
        if (aliveRef.current) setState('timed_out');
        return false;
      }
      setState('request_sent');
      try {
        const client = await getClient();
        const channel = client?.channels.get(opts.channelName) as DeviceAckChannel | undefined;
        if (!channel) {
          if (aliveRef.current) setState('timed_out');
          return false;
        }
        const requestId = safeRandomUUID();
        const acked = await sendToDevice({
          channel,
          requestId,
          publish: () => opts.publish(requestId),
        });
        // The bench may have swapped cartons while this was in flight; writing
        // state onto an unmounted surface is a leak, and writing it onto a
        // REMOUNTED one would attribute this answer to a different entity.
        if (aliveRef.current) setState(acked ? 'peer_active' : 'timed_out');
        return acked;
      } catch {
        if (aliveRef.current) setState('timed_out');
        return false;
      }
    },
    [getClient],
  );

  const retry = useCallback(() => {
    const last = lastRef.current;
    if (last) void send(last);
  }, [send]);

  const reset = useCallback(() => setState('idle'), []);

  // Success settles itself; `timed_out` never does — an unreachable phone the
  // operator did not notice is the whole defect this handshake exists to close,
  // so it holds until they retry it or the surface resets.
  useEffect(() => {
    if (state !== 'peer_active') return;
    const t = setTimeout(() => {
      if (aliveRef.current) setState('idle');
    }, PEER_ACTIVE_SETTLE_MS);
    return () => clearTimeout(t);
  }, [state]);

  // `kind` is carried for the ack payload's benefit on the phone side; the desk
  // accepts any ack matching its request id, so it is not part of the match.
  void kind;

  return { state, pending: state === 'request_sent', send, retry, reset };
}
