/**
 * Nav hover → data prefetch registry.
 *
 * Next's <Link>/router prefetch warms the ROUTE (JS + RSC payload); this warms
 * the DATA a destination paints from, so hover-then-click lands on cached rows
 * instead of a skeleton. Entries are keyed by the destination href and MUST
 * build their query options through the destination's own query factory so the
 * prefetched cache entry is byte-identical to the one the page mounts with —
 * a near-miss key is a wasted fetch, never a warm paint.
 *
 * react-query dedupes repeat hovers via staleTime, so firing this on every
 * mouseenter is free after the first.
 */

import type { QueryClient } from '@tanstack/react-query';
import { receivingLinesTableQuery } from '@/lib/queries/receiving-queries';
import {
  RECEIVING_MODES,
  type ReceivingModeContext,
} from '@/lib/receiving/receiving-modes';

/**
 * URL-less default context — exactly what `useReceivingModeContext` derives on
 * a bare `/unbox` (no search, default sort, all staff), so the prefetch key
 * matches the mount key. A user carrying `?staff=`/`?search=` params simply
 * misses the prefetch (harmless).
 */
const DEFAULT_UNBOX_CONTEXT: ReceivingModeContext = {
  historySearch: '',
  historySearchField: 'all',
  historySearchScope: 'all',
  historySort: '',
  incomingSearch: '',
  incomingState: null,
  incomingSort: '',
  incomingPoFrom: '',
  incomingPoTo: '',
  incomingPage: 1,
  incomingSource: 'all',
  isDeliveredUnscannedFacet: false,
  isDeliveredNotUnboxedFacet: false,
  staffFilterId: null,
  listSearch: '',
};

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
