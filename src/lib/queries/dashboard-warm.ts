import type { QueryClient } from '@tanstack/react-query';
import { getDashboardOrderViewFromSearch } from '@/utils/dashboard-search-state';
import { getWeekRangeForOffset } from '@/lib/dashboard-week-range';
import { readShippedFilterPreference } from '@/utils/dashboard-preferences';
import {
  unshippedOrdersQuery,
  dashboardShippedQuery,
  packedOrdersQuery,
} from '@/lib/queries/dashboard-queries';

/**
 * Default Unshipped page size — keep in lockstep with `UnshippedTable`'s
 * `rowLimit` initial (200) and `UNSHIPPED_SEED_LIMIT` in
 * `unshipped-queue-seed.server.ts`.
 *
 * This is part of the CACHE KEY, not just the request. Warming without it built
 * a `limit: null` entry while the table mounts `limit: 200`, so the prefetch
 * (a) never satisfied the render and (b) asked `/api/orders` for the ENTIRE
 * unshipped backlog with no ceiling — on every desk mount and every settled
 * search change. With the limit threaded, the warm key is byte-identical to the
 * RSC seed's key, so on a seeded desk the prefetch resolves from fresh cache
 * and issues no request at all.
 */
const UNSHIPPED_WARM_LIMIT = 200;

/**
 * Warm the active dashboard view's data into the React Query cache. Shared by
 * the page-level warm-up effect and the sign-in BootGate so a prefetch and the
 * table that later mounts always hit the same cache key (the factories are the
 * single source of truth). `shippedFilter` falls back to the stored preference,
 * matching how `DashboardShippedTable` resolves it. Returns a promise that
 * settles when the active view is ready.
 *
 * Warranty Logger lives under Support (`/support?mode=warranty`) — not warmed here.
 */
export function warmActiveView(
  queryClient: QueryClient,
  searchParamsString: string,
): Promise<unknown> {
  const sp = new URLSearchParams(searchParamsString);
  const view = getDashboardOrderViewFromSearch(sp);
  const searchQuery = String(sp.get('search') || '').trim();
  // `?staff=` is part of every orders-queue cache key (P1-WORK-02), so a warm
  // that drops it addresses a different entry than the one the table mounts.
  const staffRaw = Number(sp.get('staff'));
  const staffId = Number.isFinite(staffRaw) && staffRaw > 0 ? staffRaw : undefined;

  if (view === 'unshipped' || view === 'tested') {
    return queryClient.prefetchQuery(unshippedOrdersQuery(unshippedWarmArgs(searchQuery, staffId)));
  }
  // Packed uses the first-class stagedOnly orders path (not week packerlogs).
  if (view === 'packed') {
    const dateFrom = String(sp.get('dateFrom') || '').trim() || undefined;
    const dateTo = String(sp.get('dateTo') || '').trim() || undefined;
    return queryClient.prefetchQuery(packedOrdersQuery({ searchQuery, staffId, dateFrom, dateTo }));
  }
  if (view === 'shipped') {
    const week = getWeekRangeForOffset(0);
    const shippedFilter = sp.get('shippedFilter') || readShippedFilterPreference() || 'all';
    return queryClient.prefetchQuery(
      dashboardShippedQuery({ weekStart: week.startStr, weekEnd: week.endStr, shippedFilter }),
    );
  }
  // Default + legacy `?pending` → the merged To Ship backlog.
  return queryClient.prefetchQuery(unshippedOrdersQuery(unshippedWarmArgs(searchQuery, staffId)));
}

/**
 * The Unshipped warm args, mirroring how `UnshippedTable` mounts the same
 * factory: `strictSearchScope`, the `?staff=` scope, and the bounded page —
 * except while searching, where the table deliberately drops the ceiling
 * (`limit: deferredSearchQuery ? undefined : rowLimit`) because the results are
 * already the matches.
 */
function unshippedWarmArgs(searchQuery: string, staffId: number | undefined) {
  return {
    searchQuery,
    staffId,
    strictSearchScope: true,
    limit: searchQuery ? undefined : UNSHIPPED_WARM_LIMIT,
  };
}
