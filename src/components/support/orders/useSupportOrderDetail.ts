'use client';

/**
 * Load a single order for Support · Orders focus pane.
 * Same network path as Dashboard detail (`fetchDashboardOrderRowById`).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDashboardOrderRowById } from '@/lib/dashboard-table-data';

export function useSupportOrderDetail(openOrderId: number | null) {
  return useQuery({
    queryKey: ['support-order-detail', openOrderId],
    queryFn: () => fetchDashboardOrderRowById(openOrderId!),
    enabled: openOrderId != null && openOrderId > 0,
    staleTime: 30_000,
  });
}

/** After notes / OOS / field saves — refresh detail + shared unshipped board cache. */
export function useInvalidateSupportOrderCaches() {
  const qc = useQueryClient();
  return (orderId?: number | null) => {
    void qc.invalidateQueries({ queryKey: ['dashboard-table', 'unshipped'] });
    void qc.invalidateQueries({ queryKey: ['dashboard-table', 'unshipped-counts'] });
    if (orderId != null && orderId > 0) {
      void qc.invalidateQueries({ queryKey: ['support-order-detail', orderId] });
    } else {
      void qc.invalidateQueries({ queryKey: ['support-order-detail'] });
    }
  };
}
