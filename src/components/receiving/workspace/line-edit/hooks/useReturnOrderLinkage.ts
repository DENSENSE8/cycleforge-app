'use client';

/** useReturnOrderLinkage — resolve a scanned/returned serial to its OUTBOUND order via the closed-loop linkage SoT (`/api/order-linkage`), debounced so a live-typed serial resolves once it settles. */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OrderLinkage } from '@/lib/order-linkage';

/** Debounce a live-typed/scanned serial so we don't resolve on every keystroke. */
function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function useReturnOrderLinkage(
  serial: string | null | undefined,
): { orderPk: number; orderId: string | null } | null {
  const trimmed = (serial ?? '').trim();
  const debounced = useDebounced(trimmed);
  // Serials are ≥ several chars; the short guard avoids a resolve request on a
  // half-typed value and keeps the query cheap (debounced + 30s stale).
  const enabled = debounced.length >= 4;

  const { data } = useQuery<OrderLinkage>({
    // Same key family as any other order-linkage consumer so the cache is shared.
    queryKey: ['order-linkage', '', '', debounced],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ serial: debounced });
      const res = await fetch(`/api/order-linkage?${params.toString()}`);
      if (!res.ok) throw new Error(`order-linkage ${res.status}`);
      const json = await res.json();
      return json.linkage as OrderLinkage;
    },
  });

  const order = enabled ? data?.order : null;
  if (!order) return null;
  return { orderPk: order.id, orderId: (order.orderId ?? '').trim() || null };
}
