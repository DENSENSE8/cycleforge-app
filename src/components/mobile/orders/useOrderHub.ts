'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';
import { qk } from '@/queries/keys';
import { mobileJobReturn, withJobReturn } from '@/lib/mobile/nav-trail';
import { outboundWorkPageSchema, type OutboundWorkItem } from '@/lib/outbound/work-contract';
import { v1Request } from '@/lib/api/v1-client';
import type { OrderHubData, OrderLookupActivity, OrderLookupRecord } from '@/lib/orders/order-hub';

type OrderLookup = { order: OrderLookupRecord; activity: OrderLookupActivity[] };

async function lookup(path: string, signal?: AbortSignal): Promise<{ status: number; body: OrderLookup | null }> {
  const res = await fetch(path, { cache: 'no-store', signal });
  const body = await res.json().catch(() => null);
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok || !body?.ok) throw new Error(body?.error || `Couldn't load the order (HTTP ${res.status}).`);
  return { status: res.status, body: { order: body.order, activity: Array.isArray(body.activity) ? body.activity : [] } };
}

/**
 * `byId` (the URL's `?by=id`, set by jobs that only hold the `orders.id` pk):
 * read the pk only. Otherwise the public `order_id` first, and a numeric param
 * that misses is retried as the pk — an old pk link still lands.
 */
async function fetchOrder(param: string, byId: boolean, signal?: AbortSignal): Promise<OrderLookup> {
  if (!byId) {
    const byNumber = await lookup(`/api/orders/lookup/${encodeURIComponent(param)}`, signal);
    if (byNumber.body) return byNumber.body;
  }
  if (/^\d+$/.test(param)) {
    const byPk = await lookup(`/api/orders/lookup/${param}?by=id`, signal);
    if (byPk.body) return byPk.body;
  }
  throw new Error(`No order ${param}.`);
}

async function fetchWork(pk: number, signal?: AbortSignal): Promise<OutboundWorkItem | null> {
  const page = await v1Request(`/api/v1/outbound/work?id=${pk}`, outboundWorkPageSchema, {
    signal,
    fallbackMessage: "Couldn't load the order's stage",
  });
  return page.items[0] ?? null;
}

/** The order's two server reads, shared by the hub and every door screen through `qk.orders.hub(…)`, so moving hub ↔ door is a cache hit: */
export function useOrderHub({ byId: forceById = false }: { byId?: boolean } = {}) {
  const params = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const param = params?.orderId ? decodeURIComponent(params.orderId).trim() : '';
  const byId = forceById || searchParams?.get('by') === 'id';
  const back = mobileJobReturn(searchParams?.get('back'));

  const record = useQuery({
    queryKey: qk.orders.hub(byId ? `id:${param}` : param, 'record'),
    queryFn: ({ signal }) => fetchOrder(param, byId, signal),
    enabled: param !== '',
  });
  const pk = record.data?.order.id ?? null;
  const work = useQuery({
    queryKey: qk.orders.hub(pk ?? 0, 'work'),
    queryFn: ({ signal }) => fetchWork(pk as number, signal),
    enabled: pk != null,
  });

  const data: OrderHubData | null = record.data ? { ...record.data, work: work.data ?? null } : null;
  const base = `/m/orders/${encodeURIComponent(param)}`;
  const link = (href: string) => {
    const withBy = byId ? `${href}${href.includes('?') ? '&' : '?'}by=id` : href;
    return back ? withJobReturn(withBy, back) : withBy;
  };

  return {
    param,
    base,
    back,
    link,
    data,
    /** The projection read is still in flight — the stage chip waits, facts do not. */
    workPending: pk != null && work.isPending,
    workError: work.error instanceof Error ? work.error.message : null,
    loading: param !== '' && record.isPending,
    error: param === '' ? 'No order id.' : record.error instanceof Error ? record.error.message : null,
    reload: () => {
      void record.refetch();
      if (pk != null) void work.refetch();
    },
  };
}
