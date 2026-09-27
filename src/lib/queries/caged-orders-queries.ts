'use client';

/** Query factories for the cage (To-ship intake gate). */

import { queryOptions } from '@tanstack/react-query';
import type { CagedOrderRecord } from '@/lib/orders/caged-orders';
import type { ShippedOrder } from '@/types/orders';
import type { OrderExceptionRow } from '@/lib/orders/order-exception-types';

export const CAGED_ORDERS_QUERY_ROOT = 'caged-orders';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

/** The caged list + its total. */
export function cagedOrdersQuery(params: { limit?: number } = {}) {
  const limit = params.limit ?? 200;
  return queryOptions({
    queryKey: [CAGED_ORDERS_QUERY_ROOT, 'list', { limit }] as const,
    queryFn: async () => {
      const data = await fetchJson<{
        success: boolean;
        orders?: CagedOrderRecord[];
        count?: number;
      }>(`/api/orders/caged?limit=${limit}`);
      return { orders: data.orders ?? [], count: Number(data.count ?? 0) };
    },
    staleTime: 30_000,
  });
}

/**
 * Just the count, for the desk facet's label.
 *
 * A separate, cheap key rather than `select`-ing the list: the facet paints on
 * every desk load and must not pull 200 caged rows to print one number.
 */
export function cagedOrdersCountQuery() {
  return queryOptions({
    queryKey: [CAGED_ORDERS_QUERY_ROOT, 'count'] as const,
    queryFn: async () => {
      const data = await fetchJson<{ success: boolean; count?: number }>(
        '/api/orders/caged?countOnly=1',
      );
      return Number(data.count ?? 0);
    },
    staleTime: 30_000,
  });
}

/** One order's LIVE gate evaluation. `null` order id = nothing to ask. */
export function orderReleaseGatesQuery(orderId: number | null) {
  return queryOptions({
    queryKey: [CAGED_ORDERS_QUERY_ROOT, 'gates', orderId] as const,
    queryFn: async () => {
      const data = await fetchJson<{ success: boolean; order?: CagedOrderRecord }>(
        `/api/orders/${orderId}/cage-release`,
      );
      return data.order ?? null;
    },
    enabled: typeof orderId === 'number' && orderId > 0,
    // The gates move when the operator acts elsewhere (buys a label in the
    // Labels tab, attaches a manual). Never serve a stale green.
    staleTime: 0,
  });
}

/** Caged record → the queue grid's row shape. */
export function cagedRecordToQueueRow(record: CagedOrderRecord): ShippedOrder {
  return {
    id: record.id,
    order_id: record.orderNumber ?? '',
    product_title: record.productTitle ?? '',
    quantity: record.quantity ?? null,
    item_number: record.itemNumber ?? null,
    condition: record.condition ?? '',
    sku: '',
    serial_number: '',
    shipping_tracking_number: record.trackingNumber,
    tracking_number: record.trackingNumber,
    shipment_id: null,
    deadline_at: null,
    ship_by_date: null,
    tested_by: null,
    test_date_time: null,
    packer_id: null,
    packed_by: null,
    packed_at: null,
    account_source: record.accountSource ?? null,
    created_at: record.createdAt ?? null,
    has_pick_scan: false,
    is_out_of_stock: false,
    is_urgent: false,
  } as unknown as ShippedOrder;
}

/** Order-exception row → the queue grid's row shape. */
export function exceptionRowToQueueRow(row: OrderExceptionRow): ShippedOrder {
  const responsibility = [
    `${row.routing.category} · ${row.routing.owner}`,
    row.responsiblePerson ? `Responsible: ${row.responsiblePerson}` : null,
    `Action: ${row.routing.actionRequired}`,
    row.internalNote ? `Internal: ${row.internalNote}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    id: row.id,
    order_id: row.orderNumber ?? '',
    product_title: row.productTitle ?? '',
    quantity: row.quantity ?? null,
    item_number: row.itemNumber ?? null,
    condition: row.condition ?? '',
    sku: row.sku ?? '',
    serial_number: '',
    shipping_tracking_number: row.trackingNumber,
    tracking_number: row.trackingNumber,
    shipment_id: null,
    deadline_at: null,
    ship_by_date: null,
    tested_by: null,
    test_date_time: null,
    packer_id: null,
    packed_by: null,
    packed_at: null,
    account_source: row.accountSource ?? null,
    notes: responsibility,
    buyer_note: row.buyerNote,
    created_at: null,
    has_pick_scan: false,
    is_out_of_stock: row.routing.category === 'Out of Stock',
    is_urgent: false,
  } as unknown as ShippedOrder;
}
