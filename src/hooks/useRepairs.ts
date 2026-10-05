'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { RSRecord, type RepairTab } from '@/lib/neon/repair-service-queries';
import { REPAIR_CHANNEL_PARAM, type RepairChannel } from '@/lib/repair/repair-channel';
import { REPAIR_DESK_LIST_LIMIT } from '@/lib/repair/repair-status-chips';
import { useAblyChannel } from './useAblyChannel';
import { getDbTableChannelName, getRepairsChannelName, safeChannelName } from '@/lib/realtime/channels';
import { useAuth } from '@/contexts/AuthContext';

export function useRepairsTable(
  search?: string | null,
  tab: RepairTab = 'active',
  needsLabel = false,
  /** `repair_service.intake_channel`; null = every channel. */
  channel: RepairChannel | null = null,
) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const repairsChannel = safeChannelName(() => getRepairsChannelName(orgId!));
  const repairDbChannel = safeChannelName(() => getDbTableChannelName(orgId!, 'public', 'repair_service'));
  const queryKey = ['repairs', search || '', tab, needsLabel, channel] as const;

  const query = useQuery<RSRecord[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ tab });
      // The API's default page is 50 rows and this table has no server paging, so the desk silently stopped at the 50th repair while the kiosk…
      params.set('limit', String(REPAIR_DESK_LIST_LIMIT));
      if (search) params.set('q', search);
      if (needsLabel) params.set('needsLabel', '1');
      if (channel) params.set(REPAIR_CHANNEL_PARAM, channel);
      const res = await fetch(`/api/repair-service?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch repairs');
      const data = await res.json();
      return data.rows || data.repairs || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  // Live invalidation via Ably whenever any repair row changes.
  useAblyChannel(repairsChannel, 'repair.changed', () => {
    queryClient.invalidateQueries({ queryKey: qk.repairs.all });
  }, !!repairsChannel);

  useAblyChannel(repairDbChannel, 'db.row.changed', () => {
    queryClient.invalidateQueries({ queryKey: qk.repairs.all });
  }, !!repairDbChannel);


  return query;
}
