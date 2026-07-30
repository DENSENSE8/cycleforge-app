import type { QueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';

const DASHBOARD_TABLE_KEYS = [
  qk.dashboardTable.pending,
  qk.dashboardTable.unshipped,
  qk.dashboardTable.shipped,
  qk.dashboardTable.shippedFba,
  qk.shippedTable,
  qk.dashboardStockZoho,
];

/**
 * Single client-side refresh path after order imports or other multi-tab order writes.
 * Uses `refetchQueries` (not `invalidateQueries`) so a refetch fires *now* even
 * if React Query considers the data fresh (staleTime not yet elapsed). Also
 * passes `cancelRefetch: true` so any in-flight stale request is dropped in
 * favor of a fresh one.
 */
export async function invalidateDashboardOrderQueries(queryClient: QueryClient) {
  // First mark stale so any not-yet-mounted consumer also refetches on mount.
  for (const queryKey of DASHBOARD_TABLE_KEYS) {
    queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
  }
  // Then force an immediate refetch on every matching query (active or not).
  // `type: 'all'` so even unmounted tabs (e.g. Unshipped while user is on
  // Pending) refresh — switching tabs after an import would otherwise show
  // stale data until staleTime elapses.
  await Promise.all(
    DASHBOARD_TABLE_KEYS.map((queryKey) =>
      queryClient.refetchQueries({ queryKey, type: 'all' }),
    ),
  );
}

/**
 * Signal the outbound-order domains for components that are not on React Query
 * yet (the orders import + sync paths call this after a bulk write).
 */
export function dispatchUsavRefreshData() {
  refreshDomains(REFRESH_BUNDLES.outboundOrderWrite);
}
