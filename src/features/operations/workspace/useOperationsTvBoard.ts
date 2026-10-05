'use client';

/** Client hook for the Operations TV wall board (HOME-OPS Phase C). */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getOpsPlansChannelName, getOrdersChannelName, getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { TvBoard } from '@/lib/ops-plans/tv-board';
import type { TvLiveFeed } from '@/lib/ops-plans/tv-live-feed';

const OPS_TV_BOARD_KEY = ['operations', 'tv-board'] as const;
/** Its own key (not under the board's): plan updates do not refetch packages, scans do not refetch tasks. */
const OPS_TV_LIVE_FEED_KEY = ['operations', 'tv-live-feed'] as const;

/** Civil-day-rollover safety net (5 min). Realtime does the real-time work. */
const TV_BOARD_REFETCH_MS = 5 * 60_000;

interface TvBoardState {
  /** false only when the org lacks the `ops_tv_board` flag (route 404). */
  enabled: boolean;
  board: TvBoard | null;
}

async function fetchTvBoard(): Promise<TvBoardState> {
  const res = await fetch('/api/operations/tv-board', { cache: 'no-store' });
  if (res.status === 404) return { enabled: false, board: null };
  if (!res.ok) throw new Error(`tv-board request failed (${res.status})`);
  const json = (await res.json()) as { board: TvBoard };
  return { enabled: true, board: json.board };
}

export function useOperationsTvBoard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: OPS_TV_BOARD_KEY,
    queryFn: fetchTvBoard,
    staleTime: 60_000,
    refetchInterval: TV_BOARD_REFETCH_MS,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Live refresh: plan/task mutations + the master-plan bridge publish
  // `ops_plan.updated`; mirror PlansSidebar and invalidate on it.
  const channel = safeChannelName(() => (user ? getOpsPlansChannelName(user.organizationId) : ''));
  const onPlanUpdated = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: OPS_TV_BOARD_KEY });
  }, [queryClient]);
  useAblyChannel(channel, 'ops_plan.updated', onPlanUpdated, !!channel);

  return query;
}

async function fetchTvLiveFeed(): Promise<TvLiveFeed | null> {
  const res = await fetch('/api/operations/tv-board/live-feed', { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`tv-board live-feed request failed (${res.status})`);
  // Our own route's wire shape (`GET /api/operations/tv-board/live-feed`), typed like the board's fetch above.
  const json = (await res.json()) as { liveFeed: TvLiveFeed };
  return json.liveFeed;
}

/**
 * The wall's Live feed panel (packages by stage, pace, pickups). Same safety
 * net as the board; live refresh mirrors the Live feed's own
 * (`useLiveFeedRealtime`): a pick, pack or dock scan-out on the station
 * channel, or an order change, refetches — a burst collapsing to one per frame.
 * `null` data = the org lacks the `ops_tv_board` flag (route 404).
 */
export function useOperationsTvLiveFeed() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: OPS_TV_LIVE_FEED_KEY,
    queryFn: fetchTvLiveFeed,
    staleTime: 60_000,
    refetchInterval: TV_BOARD_REFETCH_MS,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const orgId = user?.organizationId;
  const station = safeChannelName(() => (orgId ? getStationChannelName(orgId) : ''));
  const orders = safeChannelName(() => (orgId ? getOrdersChannelName(orgId) : ''));
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: OPS_TV_LIVE_FEED_KEY });
  }, [queryClient]);
  useAblyChannel(station, 'activity.logged', refresh, !!station, { coalesce: 'frame' });
  useAblyChannel(station, 'packer-log.changed', refresh, !!station, { coalesce: 'frame' });
  useAblyChannel(orders, 'order.changed', refresh, !!orders, { coalesce: 'frame' });

  return query;
}
