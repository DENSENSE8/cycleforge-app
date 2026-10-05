'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { LIVE_FEED_QUERY_ROOT } from '@/lib/live-feed/query';
import { getOrdersChannelName, getStationChannelName } from '@/lib/realtime/channels';

/**
 * Keeps the board current: a pick, pack or dock scan-out (`activity.logged`,
 * `packer-log.changed` on the station channel) or an order change — a note, a
 * tag, an allocation (`order.changed`) — refetches every feed read, a burst
 * collapsing to one refetch per frame.
 */
export function useLiveFeedRealtime(): void {
  const queryClient = useQueryClient();
  const orgId = useAuth().user?.organizationId;
  const station = orgId ? getStationChannelName(orgId) : '';
  const orders = orgId ? getOrdersChannelName(orgId) : '';
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: LIVE_FEED_QUERY_ROOT });
  };
  useAblyChannel(station, 'activity.logged', refresh, Boolean(station), { coalesce: 'frame' });
  useAblyChannel(station, 'packer-log.changed', refresh, Boolean(station), { coalesce: 'frame' });
  useAblyChannel(orders, 'order.changed', refresh, Boolean(orders), { coalesce: 'frame' });
}

/**
 * The wall clock for relative ages ("2h here", "Late 3d"), ticking every
 * 30 seconds. `null` until mounted, so the server's HTML and the first client
 * render agree and ages paint after hydration.
 */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
