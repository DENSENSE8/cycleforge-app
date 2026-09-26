'use client';

import { useEffect, useRef } from 'react';
import { useAblyClient } from '@/contexts/AblyContext';
import { createFrameCoalescer } from '@/lib/perf/coalesce-frame';

export interface UseAblyChannelOptions {
  /** `frame` collapses a burst of messages into one handler call per animation frame (last-wins). */
  coalesce?: 'none' | 'frame';
}

/**
 * Subscribes to a single Ably channel + event via the shared client.
 * Uses a stable handler ref so the subscription is never torn down and
 * recreated on every render — only when channel/event/enabled changes.
 */
export function useAblyChannel(
  channelName: string,
  eventName: string,
  handler: (message: any) => void,
  enabled = true,
  options: UseAblyChannelOptions = {},
) {
  const { getClient } = useAblyClient();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const coalesce = options.coalesce ?? 'none';

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let channel: any = null;
    const coalescer =
      coalesce === 'frame'
        ? createFrameCoalescer<unknown>({
            mode: 'last',
            flush: (batch) => {
              if (batch.length > 0) handlerRef.current(batch[batch.length - 1]);
            },
          })
        : null;
    const stableHandler = (msg: any) => {
      if (coalescer) coalescer.push(msg);
      else handlerRef.current(msg);
    };

    getClient().then(async (client) => {
      if (disposed || !client) return;
      try {
        channel = client.channels.get(channelName);

        // If the channel previously entered a failed state (e.g. auth
        // hiccup, transient network error), detach and re-attach so the
        // subscribe call below doesn't throw.
        if (channel.state === 'failed') {
          try { await channel.detach(); } catch {}
          channel = client.channels.get(channelName);
        }

        await channel.subscribe(eventName, stableHandler);
      } catch {
        // Connection may have closed between getClient() and subscribe()
      }
    }).catch(() => {});

    return () => {
      disposed = true;
      coalescer?.dispose();
      try {
        channel?.unsubscribe(eventName, stableHandler);
      } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, eventName, enabled, coalesce]);
}
