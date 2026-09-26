'use client';

/** "Somebody is waiting for this one" — the door operator's own alert. */

import { useCallback } from 'react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getInboxChannelName, safeChannelName } from '@/lib/realtime/channels';
import { normalizeTrackingLast8 } from '@/lib/tracking-format';

export function WatchedArrivalToaster() {
  const { user } = useAuth();
  const channel = safeChannelName(() =>
    user ? getInboxChannelName(user.organizationId, user.staffId) : '',
  );

  const onWatchedArrival = useCallback(
    (message: { data?: { trackingNumber?: unknown; watcherCount?: unknown } }) => {
      const tracking =
        typeof message?.data?.trackingNumber === 'string' ? message.data.trackingNumber : '';
      const watchers = Number(message?.data?.watcherCount ?? 0);

      toast.success('Marked urgent — someone is waiting for this', {
        description: [
          tracking ? `Tracking ···${normalizeTrackingLast8(tracking)}` : null,
          watchers > 1 ? `${watchers} people watching` : watchers === 1 ? '1 person watching' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        duration: 10_000,
      });
    },
    [],
  );

  useAblyChannel(channel, 'watched_arrival', onWatchedArrival, !!channel);
  return null;
}
