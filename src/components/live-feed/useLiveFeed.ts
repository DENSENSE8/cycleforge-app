'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getOrdersChannelName, getStationChannelName, getWalkInChannelName } from '@/lib/realtime/channels';
import { LIVE_FEED_QUERY_ROOT } from '@/lib/live-feed/query';

/**
 * Keeps every Live feed read current — the Board, a status list and their
 * Copy all share the `['live-feed']` root. Every event that moves a record
 * between statuses refetches them, a burst collapsing to one refetch per frame:
 * - station channel: a pack, dock scan-out, unmatched dock scan, unbox or
 *   arrival (`activity.logged`), a carrier status change (`shipment.changed`),
 *   a receiving scan/unbox/triage stamp (`receiving-log.changed`), a packer log
 *   (`packer-log.changed`);
 * - orders channel: an order entering or leaving To pack / Ready for pickup
 *   (`order.changed`);
 * - walk-in channel: a Square sale completing at the counter (`sale.completed`).
 * Counter-visit payments and local-pickup completion publish no realtime
 * event; those statuses refresh on the next event above or a reload.
 */
export function useLiveFeedRealtime(): void {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const station = orgId ? getStationChannelName(orgId) : '';
  const orders = orgId ? getOrdersChannelName(orgId) : '';
  const walkIn = orgId ? getWalkInChannelName(orgId) : '';
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: LIVE_FEED_QUERY_ROOT });
  };
  useAblyChannel(station, 'activity.logged', refresh, Boolean(station), { coalesce: 'frame' });
  useAblyChannel(station, 'shipment.changed', refresh, Boolean(station), { coalesce: 'frame' });
  useAblyChannel(station, 'receiving-log.changed', refresh, Boolean(station), { coalesce: 'frame' });
  useAblyChannel(station, 'packer-log.changed', refresh, Boolean(station), { coalesce: 'frame' });
  useAblyChannel(orders, 'order.changed', refresh, Boolean(orders), { coalesce: 'frame' });
  useAblyChannel(walkIn, 'sale.completed', refresh, Boolean(walkIn), { coalesce: 'frame' });
}
