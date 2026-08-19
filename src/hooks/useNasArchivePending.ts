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
import type { NasArchivePendingItem } from '@/lib/receiving/nas-archive-pending';

export type { NasArchivePendingItem };

/** Local — re-export it the moment a second module needs to invalidate this key. */
const nasArchivePendingQueryKey = (receivingId?: number | null) =>
  ['nas-archive-pending', receivingId ?? 'all'] as const;

/**
 * Cartons whose ticket has photos this staffer took after it was filed, still
 * un-synced to the NAS.
 *
 * Realtime is the SAME pair {@link useReceivingPhotosRealtimeRefresh} listens
 * on — phone-bridge `receiving_photo_uploaded` (org + staff) and station
 * `receiving-photo.changed` (org) — so the prompt lights up on the same message
 * that already swaps a new shot into the photo peek. It is deliberately NOT
 * scoped to one carton: the whole point is that it still appears after the
 * operator has scanned on to the next box.
 *
 * `receivingId` narrows to the open carton, for the ticket chip's own state.
 */
export function useNasArchivePending(
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
  const queryKey = useMemo(() => nasArchivePendingQueryKey(rid), [rid]);

  const query = useQuery<{ items: NasArchivePendingItem[] }>({
    queryKey,
    queryFn: async () => {
      const qs = rid != null ? `?receivingId=${rid}` : '';
      const res = await fetch(`/api/receiving/nas-archive-pending${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as { items: NasArchivePendingItem[] };
    },
    enabled: active,
    // Photo arrivals push, so there is nothing to poll for.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // Same-tab deletes / attaches dispatch this window event; without it a photo
  // removed from the library would leave a prompt for work that no longer exists.
  useEffect(() => {
    if (!active) return;
    window.addEventListener('receiving-photo.changed', refresh);
    return () => window.removeEventListener('receiving-photo.changed', refresh);
  }, [active, refresh]);

  const phoneChannel = safeChannelName(() => getPhoneBridgeChannelName(orgId!, staffId));
  useAblyChannel(
    phoneChannel,
    'receiving_photo_uploaded',
    refresh,
    active && !!phoneChannel,
  );

  const stationChannel = safeChannelName(() => getStationChannelName(orgId!));
  useAblyChannel(stationChannel, 'receiving-photo.changed', refresh, active && !!stationChannel);

  return {
    items: query.data?.items ?? [],
    isPending: query.isPending,
    refresh,
  };
}
