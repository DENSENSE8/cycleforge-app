'use client';

/** The order LINE a Shipped package resolved to — read from the live orders feed (`/api/orders?orderId=&includeShipped=true`) under an… */

import { useQuery } from '@tanstack/react-query';
import { toOrderRecord } from '@/lib/orders/order-record-normalize';
import { OrderRecordActionStrip } from './to-ship/MorphingRowActionMenu';

interface OrderLineBag {
  orders: Record<string, unknown>[];
}

async function fetchOrderLine(id: number): Promise<OrderLineBag> {
  const res = await fetch(`/api/orders?orderId=${id}&includeShipped=true`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Order ${id} failed to load (${res.status})`);
  const data = (await res.json()) as Partial<OrderLineBag>;
  return { orders: Array.isArray(data.orders) ? data.orders : [] };
}

/**
 * The order line (`orders.id`) an open Shipped package ships, for the Shipped
 * ledger's strip ({@link ShippedOrderActionStrip}). `null`: the package has no
 * order line (an unmatched scan) — nothing is fetched.
 */
function useShippedOrderLine(lineId: number | null) {
  const query = useQuery({
    queryKey: ['orders', 'shipped-record', lineId],
    queryFn: () => fetchOrderLine(lineId as number),
    enabled: lineId != null,
    staleTime: 30_000,
  });
  const raw = query.data?.orders[0];
  return { lineId, query, line: raw ? toOrderRecord(raw) : null };
}

/** The open package's ORDER verbs — under its shipment verbs in the Shipped ledger's strip. */
export function ShippedOrderActionStrip({ lineId }: { lineId: number | null }) {
  const { line } = useShippedOrderLine(lineId);
  if (!line) return null;
  return <OrderRecordActionStrip key={line.id} record={line} viewKey="shipping.shipped" />;
}
