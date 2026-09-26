/** Nav hover → data prefetch registry. */

import type { QueryClient } from '@tanstack/react-query';
import { receivingLinesTableQuery } from '@/lib/queries/receiving-queries';
import { RECEIVING_MODES } from '@/lib/receiving/receiving-modes';
import { DEFAULT_UNBOX_CONTEXT } from '@/lib/receiving/default-unbox-context';

/** Warm the default Unbox tab's spine (History · view=activity, paint tier). */
function prefetchUnboxDefaultFeed(queryClient: QueryClient): void {
  void queryClient.prefetchQuery(
    receivingLinesTableQuery(RECEIVING_MODES.history, DEFAULT_UNBOX_CONTEXT, 'spine'),
  );
}

const NAV_DATA_PREFETCHERS: Record<string, (queryClient: QueryClient) => void> = {
  '/unbox': prefetchUnboxDefaultFeed,
};

/** Fire the destination's data prefetcher, if one is registered. */
export function prefetchNavData(href: string | undefined, queryClient: QueryClient): void {
  if (!href) return;
  NAV_DATA_PREFETCHERS[href]?.(queryClient);
}
