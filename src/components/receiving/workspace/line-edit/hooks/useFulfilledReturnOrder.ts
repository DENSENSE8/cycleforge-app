'use client';

/**
 * The order a returned serial left on, only once it was PACKED or SHIPPED and
 * only when this carton arrived after it left — the carton the unit was first
 * bought in also carries its serial, and that is not a return. Unbox's Return
 * order tab, its return-found toast and the hidden Pair tab key off exactly this.
 * Reads the same resolve Search's order record opens with
 * (`searchOrderByIdResolveQuery`), so the tab's record paints from this cache.
 */

import { useQuery } from '@tanstack/react-query';
import { isOrderShipped } from '@/components/shipped/details-panel/shipped-details-logic';
import { searchOrderByIdResolveQuery } from '@/lib/search/search-order-resolve-query';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

/** The packed / shipped order record, else null. */
export function useFulfilledReturnOrder(
  orderPk: number | null | undefined,
  /** When this carton reached us (door scan, else line creation); null = unknown, not a veto. */
  arrivedAt: string | null | undefined,
): ShippedOrder | null {
  const { data } = useQuery(searchOrderByIdResolveQuery(orderPk ?? 0));
  const order = data?.status === 'ok' ? data.order : null;
  if (!order || Number(order.id) !== orderPk) return null;
  if (!isOrderShipped(order) && !order.packed_at) return null;
  const leftMs = Date.parse(order.packed_at ?? order.ship_confirmed_at ?? '');
  const arrivedMs = Date.parse(arrivedAt ?? '');
  if (Number.isFinite(leftMs) && Number.isFinite(arrivedMs) && arrivedMs < leftMs) return null;
  return order;
}
