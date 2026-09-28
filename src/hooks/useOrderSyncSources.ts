'use client';

import { useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';

/** One linked platform the To-ship Sync can run (`GET /api/integrations/order-sources`). */
export type OrderSyncSource = {
  provider: string;
  label: string;
  canSync: boolean;
};

export const ORDER_SYNC_SOURCES_STALE_MS = 60_000;

export async function fetchOrderSyncSources(): Promise<OrderSyncSource[]> {
  const res = await fetch('/api/integrations/order-sources');
  if (res.status === 401 || res.status === 403) return [];
  if (!res.ok) throw new Error('Failed to fetch order sources');
  const data = (await res.json().catch(() => ({}))) as { sources?: OrderSyncSource[] };
  return data.sources ?? [];
}

export function useOrderSyncSources() {
  return useQuery({
    queryKey: qk.orderSyncSources,
    queryFn: fetchOrderSyncSources,
    staleTime: ORDER_SYNC_SOURCES_STALE_MS,
    retry: false,
  });
}
