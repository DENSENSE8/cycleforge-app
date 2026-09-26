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

/** Single client-side refresh path after order imports or other multi-tab order writes. */
export async function invalidateDashboardOrderQueries(queryClient: QueryClient) {
  // First mark stale so any not-yet-mounted consumer also refetches on mount.
  for (const queryKey of DASHBOARD_TABLE_KEYS) {
    queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
  }
  // Then force an immediate refetch on every matching query (active or not).
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
