/**
 * The phone order hub's read model (`/m/orders/[orderId]` and its doors).
 *
 * Two server reads, never re-derived on the client:
 *   - `GET /api/orders/lookup/<param>` → {@link OrderLookupRecord} + activity:
 *     customer, ship-to, tracking numbers, serials, notes count.
 *   - `GET /api/v1/outbound/work?id=<pk>` → the server-owned `OutboundWorkItem`:
 *     Zoho-governed title, warehouse stage, label, acknowledgment, stock.
 *
 * Pure: types and formatting only, safe on client and server.
 */

import type { OutboundWorkItem } from '@/lib/outbound/work-contract';

/** The order row `GET /api/orders/lookup/[orderId]` returns. */
export interface OrderLookupRecord {
  id: number;
  order_id: string;
  product_title: string | null;
  sku: string | null;
  condition: string | null;
  status: string | null;
  status_history: unknown;
  quantity: string | null;
  notes: string | null;
  note_count: number;
  account_source: string | null;
  order_date: string | null;
  created_at: string | null;
  item_number: string | null;
  shipment_id: number | null;
  customer_id: number | null;
  customer_name: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_postal_code: string | null;
  ship_to_address_1: string | null;
  ship_by_date: string | null;
  tester_id: number | null;
  packer_id: number | null;
  tracking_numbers: string[];
  serials: string[];
}

/** One `work_assignments` row on the order, newest first. */
export interface OrderLookupActivity {
  event_at: string | null;
  work_type: string | null;
  status: string | null;
  actor_id: number | null;
  actor_name: string | null;
}

export interface OrderHubData {
  order: OrderLookupRecord;
  activity: OrderLookupActivity[];
  /** The outbound projection's record; null when the order is outside it (e.g. FBA). */
  work: OutboundWorkItem | null;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** `Sep 25 · 2:14 PM`, or null for a missing / unparsable stamp. */
export function formatOrderStamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/** The title the floor reads: the Zoho-governed projection title, then the order's own. */
export function orderHubTitle(data: OrderHubData): string {
  return data.work?.product.title || data.order.product_title || data.order.sku || 'Untitled product';
}

/** The live tracking number: the projection's shipment, then the order's own numbers. */
export function orderHubTracking(data: OrderHubData): { number: string | null; carrier: string | null } {
  return {
    number: data.work?.tracking.number ?? data.order.tracking_numbers[0] ?? null,
    carrier: data.work?.tracking.carrier ?? null,
  };
}

export function orderShipTo(order: OrderLookupRecord): string | null {
  const line = [order.ship_to_address_1, order.ship_to_city, order.ship_to_state, order.ship_to_postal_code]
    .filter(Boolean)
    .join(', ');
  return line || null;
}

/** `PICK · DONE` → `Pick · done`. */
export function activityTitle(event: OrderLookupActivity): string {
  const words = [event.work_type, event.status]
    .filter(Boolean)
    .map((part) => String(part).replace(/_/g, ' ').toLowerCase());
  const text = words.join(' · ') || 'update';
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
