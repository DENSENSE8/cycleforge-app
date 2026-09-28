'use client';

import { useQuery } from '@tanstack/react-query';
import type { TrackingHistoryEntry } from '@/lib/orders/order-tracking-history';

/** Prefix key — invalidate after any tracking write on the order. */
export const orderTrackingHistoryKey = (orderId: number) => ['order-tracking-history', orderId] as const;

/** Earlier tracking numbers of the order; refetches whenever the current one changes. */
export function useOrderTrackingHistory(orderId: number, current: string | null) {
  return useQuery({
    queryKey: [...orderTrackingHistoryKey(orderId), current ?? ''],
    queryFn: async (): Promise<TrackingHistoryEntry[]> => {
      const res = await fetch(`/api/orders/${orderId}/tracking-history`, { credentials: 'same-origin' });
      const body = (await res.json().catch(() => ({}))) as { entries?: TrackingHistoryEntry[]; error?: string };
      if (!res.ok) throw new Error(body.error || 'Could not load the tracking history.');
      return body.entries ?? [];
    },
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 30_000,
  });
}
