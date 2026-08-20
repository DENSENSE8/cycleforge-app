'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import {
  getPhoneBridgeChannelName,
  getStationChannelName,
  safeChannelName,
} from '@/lib/realtime/channels';
import type { PendingWorkItem, PendingWorkSource } from '@/lib/receiving/pending-work-model';

export type { PendingWorkItem, PendingWorkSource };

/** Module-local: the hook is the only consumer, so exporting it is dead surface. */
const pendingWorkQueryKey = (receivingId?: number | null) =>
  ['pending-work', receivingId ?? 'all'] as const;

/**
 * Follow-up work this staffer owes, live.
 *
 * Realtime is the SAME pair {@link useReceivingPhotosRealtimeRefresh} listens
 * on — phone-bridge `receiving_photo_uploaded` (org + staff) and station
 * `receiving-photo.changed` (org) — so the card lights up on the same message
 * that already swaps a new shot into the photo peek.
 *
 * That pair covers the photo-shaped sources completely. It does NOT cover
 * exceptions, which have no realtime event of their own: those land via the
 * focus refetch and the 30s staleness window instead. That is the honest
 * behaviour for a backlog measured in hours, and adding an event for it is a
 * separate change — not something to fake with a poll.
 */
export function usePendingWork(
  { receivingId, enabled = true }: { receivingId?: number | null; enabled?: boolean } = {},
) {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const staffId = Number(user?.staffId) || 0;
  const queryClient = useQueryClient();

  const rid =
    receivingId != null && Number.isFinite(receivingId) && receivingId > 0
      ? Math.trunc(receivingId)
      : null;
  const active = enabled && Boolean(orgId) && staffId > 0;
  const queryKey = useMemo(() => pendingWorkQueryKey(rid), [rid]);

  const query = useQuery<{ items: PendingWorkItem[] }>({
    queryKey,
    queryFn: async () => {
      const qs = rid != null ? `?receivingId=${rid}` : '';
      const res = await fetch(`/api/receiving/pending-work${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as { items: PendingWorkItem[] };
    },
    enabled: active,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // Same-tab deletes / attaches dispatch this window event; without it a photo
  // removed from the library would leave a card for work that no longer exists.
  useEffect(() => {
    if (!active) return;
    window.addEventListener('receiving-photo.changed', refresh);
    return () => window.removeEventListener('receiving-photo.changed', refresh);
  }, [active, refresh]);

  const phoneChannel = safeChannelName(() => getPhoneBridgeChannelName(orgId!, staffId));
  useAblyChannel(phoneChannel, 'receiving_photo_uploaded', refresh, active && !!phoneChannel);

  const stationChannel = safeChannelName(() => getStationChannelName(orgId!));
  useAblyChannel(stationChannel, 'receiving-photo.changed', refresh, active && !!stationChannel);

  return {
    items: query.data?.items ?? [],
    isPending: query.isPending,
    refresh,
  };
}
