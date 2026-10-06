/**
 * Browser transport for Labels & docs › Orders (`GET /api/shipping/label-intake/orders`).
 * Same-origin, session cookie only. Multi params go as comma lists — the
 * encoding the sidebar's multi facets write.
 */
import type { OrderPacketQuery, OrderPacketQueue } from './order-packet-contracts';

/** Every Orders read — invalidate after a pairing, an upload, a not-required toggle or a print. */
export const ORDER_PACKETS_KEY_ROOT = ['label-intake', 'order-packets'] as const;

export const orderPacketsKey = (query: OrderPacketQuery) => [...ORDER_PACKETS_KEY_ROOT, query] as const;

/** The query string of an Orders read: absent / empty params are omitted (the server applies the defaults). */
export function orderPacketsSearch(query: OrderPacketQuery): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    const text = Array.isArray(value) ? value.join(',') : value == null ? '' : String(value);
    if (text !== '') params.set(name, text);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

export async function fetchOrderPackets(query: OrderPacketQuery): Promise<OrderPacketQueue> {
  const response = await fetch(`/api/shipping/label-intake/orders${orderPacketsSearch(query)}`, { credentials: 'same-origin', cache: 'no-store' });
  const payload = (await response.json().catch(() => null)) as (OrderPacketQueue & { error?: string }) | null;
  if (!response.ok || !payload || !Array.isArray(payload.rows)) {
    throw new Error(payload?.error ?? `Orders request failed (${response.status}).`);
  }
  return payload;
}
