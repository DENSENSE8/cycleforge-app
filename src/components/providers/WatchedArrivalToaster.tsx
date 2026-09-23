'use client';

/**
 * "Somebody is waiting for this one" — the door operator's own alert.
 *
 * Renders nothing; listens on the signed-in staffer's OWN inbox channel for
 * `watched_arrival`, published by `promoteWatchedArrival` at the moment a
 * scanned tracking number matches a live watch.
 *
 * WHY THIS EXISTS AS ITS OWN SUBSCRIBER. Every other leg of the notification
 * pipeline is for people who were not there — the fan-out worker excludes the
 * actor by design, because you do not need an inbox row about your own scan.
 * A watched arrival inverts that: the news is not "a carton was scanned", it is
 * "the box in your hands is the one somebody has been waiting for, and it has
 * just been flagged urgent." The operator standing at the door is exactly who
 * must hear it, and they must hear it there — not in a queue they open later.
 *
 * Mounted once in `WarehouseShell`, which is the shell BOTH surfaces render
 * through (it picks the `/m` tree or the desk tree from the request path), so
 * the toast follows the scanner rather than the desk. It lives under
 * `components/providers/` so the `/m` tree may import it (ARCHITECTURE.md
 * rule 2 allowlist).
 * Bottom-right is the app's one toast corner (`AppToaster position`), not a
 * per-call placement — a second corner would be a second toast system.
 */

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
