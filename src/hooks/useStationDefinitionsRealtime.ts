'use client';

/**
 * Station composition realtime — a desktop publish repaints every device.
 *
 * `/api/stations/publish` emits `station-definition.published` on the org's
 * station channel after the is_active flip. This hook invalidates the two
 * queries a composed surface hangs on: the page's definitions
 * (`stationDefinitionsQuery`) and the surface resolve (`SurfaceGate`), so the
 * next paint reads the new active version. No payload is applied client-side —
 * the server stays the source of truth and a reconnect flood costs one refetch.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { invalidateStationDefinitions } from '@/lib/queries/station-queries';
import { useAblyChannel } from './useAblyChannel';

export const STATION_DEFINITION_PUBLISHED_EVENT = 'station-definition.published';

/**
 * @param pageKey When given, only publishes for this page invalidate; a
 * surface that does not know its page (SurfaceGate) passes nothing and
 * invalidates on every station publish in the org.
 */
export function useStationDefinitionsRealtime(pageKey?: string): void {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const channel = safeChannelName(() => getStationChannelName(orgId!));

  useAblyChannel(
    channel,
    STATION_DEFINITION_PUBLISHED_EVENT,
    (message: { data?: { pageKey?: unknown } }) => {
      const published = typeof message?.data?.pageKey === 'string' ? message.data.pageKey : null;
      if (pageKey && published && published !== pageKey) return;
      invalidateStationDefinitions(queryClient, published ?? pageKey);
      void queryClient.invalidateQueries({ queryKey: ['surface-resolve'] });
    },
    Boolean(channel),
    { coalesce: 'frame' },
  );
}
