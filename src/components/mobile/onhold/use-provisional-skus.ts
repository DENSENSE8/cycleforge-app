'use client';

/**
 * One cache entry for the org's on-hold placeholders.
 *
 * This is a hook because two screens need the SAME data with the SAME shape:
 * the queue lists it, and the reconcile screen reads one row out of it. Before
 * it existed, both screens wrote their own `queryFn` under the same
 * `['provisional-skus']` key — and react-query serves a cached key without
 * rerunning the second function, so the reconcile screen received the LIST
 * where it expected an ITEM, and every field read off it was undefined while
 * the page still rendered. A query key is a promise about shape; two functions
 * under one key is a lie one of them eventually pays for.
 */

import { useQuery } from '@tanstack/react-query';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';

export function useProvisionalSkus() {
  return useQuery<ProvisionalSku[]>({
    queryKey: ['provisional-skus'],
    queryFn: async () => {
      const res = await fetch('/api/sku-catalog/provisional', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load on-hold products');
      const json = (await res.json()) as { items?: ProvisionalSku[] };
      return json.items ?? [];
    },
  });
}
