'use client';

/** Client hook for the Operations TV wall board (HOME-OPS Phase C). */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getOpsPlansChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { TvBoard } from '@/lib/ops-plans/tv-board';

export const OPS_TV_BOARD_KEY = ['operations', 'tv-board'] as const;

/** Civil-day-rollover safety net (5 min). Realtime does the real-time work. */
const TV_BOARD_REFETCH_MS = 5 * 60_000;

export interface TvBoardState {
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
