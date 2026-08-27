'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { DashboardData } from '@/features/operations/types';
import {
  OPERATIONS_QUERY_KEY,
  mergeKpiUpdate,
  prependActivityEvent,
} from './operations-dashboard-logic';

/**
 * Bound the snapshot fetch so a slow/hung `/api/dashboard/operations` can't pin
 * the Monitor in a loading/blank state — on timeout it aborts → `isError` → the
 * dashboard paints a localized degraded band with Retry (H1 Phase B). Local
 * surface budget; not a repo-wide law.
 */
const OPERATIONS_DASHBOARD_FETCH_TIMEOUT_MS = 15_000;

/**
 * Fetches the 24h operations snapshot (polled every 60s) and live-patches the
 * React Query cache from the dashboard realtime channel — `kpi_update` merges a
 * summary category, `activity_event` prepends to the activity feed. Surfaces
 * `isError` + `refetch` so the Monitor can show a retryable degraded state
 * instead of blank KPI tiles that read as a quiet warehouse.
 */
export function useOperationsDashboardData() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: OPERATIONS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/dashboard/operations?timeRange=24h', {
        signal: AbortSignal.timeout(OPERATIONS_DASHBOARD_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const channelName = safeChannelName(() => getDashboardChannelName(user?.organizationId ?? ''));

  useAblyChannel(channelName, 'kpi_update', (msg) => {
    queryClient.setQueryData<DashboardData | undefined>(OPERATIONS_QUERY_KEY, (old) =>
      mergeKpiUpdate(old, msg.data),
    );
  }, !!channelName);

  useAblyChannel(channelName, 'activity_event', (msg) => {
    queryClient.setQueryData<DashboardData | undefined>(OPERATIONS_QUERY_KEY, (old) =>
      prependActivityEvent(old, msg.data),
    );
  }, !!channelName);

  return { data, isLoading, isError, refetch };
}
