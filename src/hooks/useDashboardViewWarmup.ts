'use client';

/** Prefetch-warm the dashboard's data into the React Query cache. */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { warmActiveView } from '@/lib/queries/dashboard-warm';
import { unshippedOrdersQuery } from '@/lib/queries/dashboard-queries';
import type { DashboardOrderView } from '@/utils/dashboard-search-state';

interface UseDashboardViewWarmupArgs {
  orderView: DashboardOrderView;
  /** Included so a search change re-warms the active view (matches prior deps). */
  searchQuery: string;
  /**
   * Off while a non-outbound dashboard domain is active (e.g. `?mode=inbound`),
   * so we never prefetch order data that domain doesn't render. Defaults on.
   */
  enabled?: boolean;
}

export function useDashboardViewWarmup({
  orderView,
  searchQuery,
  enabled = true,
}: UseDashboardViewWarmupArgs): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    // Prefetch the active view immediately so it loads as fast as possible.
    void warmActiveView(queryClient, window.location.search);

    // Warm the merged Unshipped backlog after a short idle delay so landing on
    // another tab and switching back feels instant. strictSearchScope mirrors
    // how the dashboard mounts the table.
    const timer = setTimeout(() => {
      if (orderView !== 'unshipped') {
        void queryClient.prefetchQuery(unshippedOrdersQuery({ strictSearchScope: true }));
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [queryClient, orderView, searchQuery, enabled]);
}
