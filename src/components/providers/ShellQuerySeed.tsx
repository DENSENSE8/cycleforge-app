'use client';

import { useMemo, type ReactNode } from 'react';
import { HydrationBoundary, useQueryClient, type DehydratedState } from '@tanstack/react-query';

/**
 * Hydrate the QueryClient ABOVE the app shell — first paint only. A query the
 * client already holds data for is the client's: the realtime / refresh paths
 * own it from then on, so a later shell RSC render (router refresh, dev HMR)
 * never rewrites it with the server's older snapshot of optimistic rows.
 */
export function ShellQuerySeed({
  state,
  children,
}: {
  state: DehydratedState | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const firstPaint = useMemo(() => {
    if (!state) return null;
    const cache = queryClient.getQueryCache();
    const queries = state.queries.filter((q) => cache.get(q.queryHash)?.state.data === undefined);
    return queries.length > 0 ? { ...state, queries } : null;
  }, [state, queryClient]);
  // Always the same element, so the shell never remounts when a seed comes or goes.
  return <HydrationBoundary state={firstPaint}>{children}</HydrationBoundary>;
}
