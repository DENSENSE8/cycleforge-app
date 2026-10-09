'use client';

/**
 * One order's record, looked up outside any queue — what Search opens for
 * `?sel=order:<id|order#>` and what Unbox opens for a returned serial's order.
 * A numeric id resolves by `orders.id`, anything else as a marketplace order #
 * (`resolve-search-order`); every line of that order is read live under
 * `orders` so `OrderRecordView`'s inline edits patch these rows too.
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { fetchOrderLookupData } from '@/lib/dashboard-table-data';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';
import {
  searchOrderByIdResolveQuery,
  searchOrderResolveQuery,
} from '@/lib/search/search-order-resolve-query';

export interface OrderRecordLookup {
  /** The order is still resolving (nothing to paint yet). */
  resolving: boolean;
  /** The open line, read from the live lines; null when nothing matched. */
  record: ShippedOrder | null;
  /** Every line of the order (the open line alone until they land). */
  records: readonly ShippedOrder[];
}

export function useOrderRecordLookup(orderId: string | number): OrderRecordLookup {
  const token = String(orderId ?? '').trim();
  const orderPk = Number(orderId);
  const resolveByPk = Number.isSafeInteger(orderPk) && orderPk > 0;
  const byIdQuery = useQuery({
    ...searchOrderByIdResolveQuery(resolveByPk ? orderPk : 0),
    enabled: resolveByPk,
  });
  const byTokenQuery = useQuery({
    ...searchOrderResolveQuery(token),
    enabled: !resolveByPk && token.length > 0,
  });
  const resolveQuery = resolveByPk ? byIdQuery : byTokenQuery;
  const resolved = resolveQuery.data;
  const resolving = (resolveQuery.isPending || resolveQuery.isLoading) && !resolved;
  const order = resolved?.status === 'ok' ? resolved.order : null;

  // The pk is known before the order resolves: start the record's slowest
  // read (timeline + photo peek, one key) now instead of after paint.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (resolveByPk) void queryClient.prefetchQuery(orderTimelineQuery(orderPk));
  }, [queryClient, resolveByPk, orderPk]);

  // Every line of this order. Keyed under `orders` so the inline edits'
  // optimistic patch (`useOrderAssignment`) lands on these rows too.
  const orderNumber = String(order?.order_id ?? '').trim();
  const linesQuery = useQuery({
    queryKey: ['orders', 'search-record-lines', orderNumber],
    queryFn: () => fetchOrderLookupData(orderNumber, { includeFba: true }),
    enabled: orderNumber.length > 0,
    staleTime: 0,
  });
  const records = useMemo(() => {
    const lines = (linesQuery.data ?? []).filter((line) => String(line.order_id ?? '').trim() === orderNumber);
    return lines.length > 0 ? lines : order ? [order] : [];
  }, [linesQuery.data, order, orderNumber]);
  // The record reads the LIVE row (optimistic edits land there).
  const record = order ? (records.find((line) => Number(line.id) === Number(order.id)) ?? order) : null;

  return { resolving, record, records };
}
