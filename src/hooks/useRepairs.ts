'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { RSRecord, type RepairTab } from '@/lib/neon/repair-service-queries';
import { useAblyChannel } from './useAblyChannel';
import { getDbTableChannelName, getRepairsChannelName, safeChannelName } from '@/lib/realtime/channels';
import { useAuth } from '@/contexts/AuthContext';
import { useRefreshSignal } from '@/lib/refresh/bus';

export function useRepairsTable(
  search?: string | null,
  tab: RepairTab = 'active',
  needsLabel = false,
) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const repairsChannel = safeChannelName(() => getRepairsChannelName(orgId!));
  const repairDbChannel = safeChannelName(() => getDbTableChannelName(orgId!, 'public', 'repair_service'));
  const queryKey = ['repairs', search || '', tab, needsLabel] as const;

  const query = useQuery<RSRecord[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ tab });
      // The API's default page is 50 rows and this table has no server paging,
      // so the desk silently stopped at the 50th repair while the kiosk History
      // face (keyset-paged) reached every one. Ask for the route's ceiling —
      // the whole book is a few hundred rows; the grid pages it client-side.
      params.set('limit', '500');
      if (search) params.set('q', search);
      if (needsLabel) params.set('needsLabel', '1');
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

  useRefreshSignal('repairs', () => {
    queryClient.invalidateQueries({ queryKey: qk.repairs.all });
  });

  return query;
}
