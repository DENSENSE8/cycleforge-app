import type { QueryClient } from '@tanstack/react-query';
import { getDashboardOrderViewFromSearch } from '@/utils/dashboard-search-state';
import { getWeekRangeForOffset } from '@/lib/dashboard-week-range';
import { readShippedFilterPreference } from '@/utils/dashboard-preferences';
import {
  unshippedOrdersQuery,
  dashboardShippedQuery,
  packedOrdersQuery,
} from '@/lib/queries/dashboard-queries';

/** Default Unshipped page size — keep in lockstep with `UnshippedTable`'s `rowLimit` initial (200) and `UNSHIPPED_SEED_LIMIT` in… */
const UNSHIPPED_WARM_LIMIT = 200;

/** Warm the active dashboard view's data into the React Query cache. */
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

  if (view === 'unshipped' || view === 'picked') {
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

/** The Unshipped warm args, mirroring how `UnshippedTable` mounts the same factory: */
function unshippedWarmArgs(searchQuery: string, staffId: number | undefined) {
  return {
    searchQuery,
    staffId,
    strictSearchScope: true,
    limit: searchQuery ? undefined : UNSHIPPED_WARM_LIMIT,
  };
}
