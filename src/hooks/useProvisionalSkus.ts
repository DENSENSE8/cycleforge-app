'use client';

/**
 * SKU exceptions (on-hold placeholder products) on the client — ONE cache
 * shape for the phone hub (`/m/on-hold/[sku]` and its screens) and the desk
 * (`/inventory/sku-exceptions`).
 *
 * Keys come from `qk.skuExceptions`: the queue under `list`, one record under
 * `hub(sku, 'record')`. Every screen of the phone hub reads the same record
 * key, so moving hub ↔ Photos ↔ Locations ↔ Details refetches nothing; the
 * realtime subscription (`useSkuExceptionsRealtime`) is what invalidates.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { qk } from '@/queries/keys';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { isStockDeltaActivity } from '@/lib/inventory/stock-live-refresh';
import type { ProvisionalSku, ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';

export function useProvisionalSkus() {
  return useQuery<ProvisionalSku[]>({
    queryKey: qk.skuExceptions.list,
    queryFn: async () => {
      const res = await fetch('/api/sku-catalog/provisional', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load SKU exceptions');
      const json = (await res.json()) as { items?: ProvisionalSku[] };
      return json.items ?? [];
    },
  });
}

interface ProvisionalSkuRecord {
  item: ProvisionalSkuDetail | null;
  /** The real SKU a paired placeholder became; `null` while open or unknown. */
  mergedInto: string | null;
}

/** One exception with photos. `data` is `null` (and `mergedInto` set) once it was paired. */
export function useProvisionalSku(sku: string | null) {
  const query = useQuery<ProvisionalSkuRecord>({
    queryKey: qk.skuExceptions.hub(sku ?? '', 'record'),
    enabled: Boolean(sku),
    queryFn: async () => {
      const res = await fetch(`/api/sku-catalog/provisional/${encodeURIComponent(sku ?? '')}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as {
        item?: ProvisionalSkuDetail;
        mergedInto?: string | null;
        error?: string;
      } | null;
      if (res.status === 404) return { item: null, mergedInto: json?.mergedInto ?? null };
      if (!res.ok || !json?.item) throw new Error(json?.error || 'Could not load SKU exception');
      return { item: json.item, mergedInto: null };
    },
  });
  return {
    ...query,
    data: query.data ? query.data.item : query.data,
    mergedInto: query.data?.mergedInto ?? null,
  };
}

/** Refetch every SKU-exception read — call after every write. */
export async function invalidateSkuExceptions(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: qk.skuExceptions.all });
}

/**
 * Keep every open SKU-exception screen live: `sku-exception.changed` (mint,
 * rename, photo, merge) and `STOCK_DELTA_*` (a count moved at any bin — the
 * phone keypad, the gun, the desk) both refetch. Frame-coalesced: the handler
 * only invalidates, so a burst costs one refetch. Mount once per route family
 * (a `layout.tsx`), not per screen.
 */
export function useSkuExceptionsRealtime(): void {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const channel = safeChannelName(() => getStationChannelName(user?.organizationId!));

  const onException = useCallback(() => {
    void invalidateSkuExceptions(queryClient);
  }, [queryClient]);
  const onActivity = useCallback(
    (message: { data?: { activityType?: string } }) => {
      if (!isStockDeltaActivity(message?.data?.activityType)) return;
      void invalidateSkuExceptions(queryClient);
    },
    [queryClient],
  );

  useAblyChannel(channel, 'sku-exception.changed', onException, !!channel, { coalesce: 'frame' });
  useAblyChannel(channel, 'activity.logged', onActivity, !!channel, { coalesce: 'frame' });
}
