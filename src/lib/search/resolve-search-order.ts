/**
 * Resolve a Search identifier (human order # or carrier tracking) to a
 * ShippedOrder. Typed digits are marketplace order numbers, never `orders.id`.
 * tracking token) to a ShippedOrder. Lookup success must not collapse to
 * "not found" when the dashboard queue row is missing — Search detail is an
 * overall order display, not a queue-scoped view.
 */

import type { ShippedOrder } from '@/types/orders';
import { fetchDashboardOrderRowById } from '@/lib/dashboard-table-data';
import { isFbaOrder } from '@/utils/order-platform';

type ResolvedSearchOrder =
  | { status: 'ok'; order: ShippedOrder }
  | { status: 'fba' }
  | { status: 'notfound' };

export type { ResolvedSearchOrder };

function asString(value: unknown): string {
  return value == null ? '' : String(value);
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '').trim()).filter(Boolean);
}

/**
 * Map a partial order payload (lookup API, GET /api/orders/:id, or dashboard
 * row) into a ShippedOrder sufficient for Search order detail.
 */
export function toShippedOrderFromApi(raw: Record<string, unknown> | null | undefined): ShippedOrder | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const orderId = asString(raw.order_id).trim();
  if (!orderId) return null;

  const trackingNumbers = stringList(raw.tracking_numbers);
  const primaryTracking =
    asNullableString(raw.shipping_tracking_number) ||
    asNullableString(raw.tracking_number) ||
    trackingNumbers[0] ||
    null;
  const mergedTracking =
    trackingNumbers.length > 0 ? trackingNumbers : primaryTracking ? [primaryTracking] : [];

  const serials = stringList(raw.serials);
  const serialNumber =
    serials.length > 0 ? serials.join(', ') : asString(raw.serial_number).trim();

  return {
    id,
    order_id: orderId,
    product_title: asString(raw.product_title).trim() || 'Order',
    quantity: raw.quantity != null ? asString(raw.quantity) : null,
    item_number: asNullableString(raw.item_number),
    condition: asString(raw.condition),
    shipment_id: (raw.shipment_id as number | string | null | undefined) ?? null,
    shipping_tracking_number: primaryTracking,
    tracking_numbers: mergedTracking,
    serial_number: serialNumber,
    sku: asString(raw.sku),
    tester_id: asNullableNumber(raw.tester_id),
    tested_by: asNullableNumber(raw.tested_by),
    test_date_time: asNullableString(raw.test_date_time),
    packer_id: asNullableNumber(raw.packer_id),
    packed_by: asNullableNumber(raw.packed_by),
    packed_at: asNullableString(raw.packed_at),
    packer_photos_url: raw.packer_photos_url ?? null,
    tracking_type: asNullableString(raw.tracking_type),
    account_source: asNullableString(raw.account_source),
    notes: asString(raw.notes),
    sale_amount: (raw.sale_amount as string | number | null | undefined) ?? null,
    currency: asNullableString(raw.currency),
    status_history: raw.status_history ?? null,
    created_at: asNullableString(raw.created_at) ?? asNullableString(raw.order_date),
    ship_by_date: asNullableString(raw.ship_by_date) ?? asNullableString(raw.deadline_at),
    deadline_at: asNullableString(raw.deadline_at),
    customer_id: asNullableNumber(raw.customer_id),
    buyer_note: asNullableString(raw.buyer_note),
    shipment_status: asNullableString(raw.shipment_status),
    latest_status_label: asNullableString(raw.latest_status_label),
    is_shipped: Boolean(raw.is_shipped),
    is_delivered: Boolean(raw.is_delivered),
    row_source: 'order',
  };
}

async function fetchOrderByNumericId(id: number): Promise<ResolvedSearchOrder> {
  const dashboard = await fetchDashboardOrderRowById(id);
  if (dashboard) return { status: 'ok', order: dashboard };

  try {
    const res = await fetch(`/api/orders/${id}`, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return { status: 'notfound' };
    const payload = (await res.json())?.order as Record<string, unknown> | undefined;
    if (!payload) return { status: 'notfound' };
    if (isFbaOrder(asString(payload.order_id), asNullableString(payload.account_source))) {
      return { status: 'fba' };
    }
    const order = toShippedOrderFromApi(payload);
    return order ? { status: 'ok', order } : { status: 'notfound' };
  } catch {
    return { status: 'notfound' };
  }
}

/**
 * Resolve Search / `/o` openOrderId — numeric pk, human order #, or carrier
 * tracking (`/api/orders/lookup` falls through to tracking when order_id misses).
 */
export async function resolveSearchOrder(orderId: string): Promise<ResolvedSearchOrder> {
  const raw = decodeURIComponent(orderId || '').trim();
  if (!raw) return { status: 'notfound' };

  try {
    const res = await fetch(`/api/orders/lookup/${encodeURIComponent(raw)}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return { status: 'notfound' };
    const payload = (await res.json())?.order as Record<string, unknown> | undefined;
    if (!payload) return { status: 'notfound' };
    if (isFbaOrder(asString(payload.order_id), asNullableString(payload.account_source))) {
      return { status: 'fba' };
    }

    const lookupId = Number(payload.id);
    if (Number.isFinite(lookupId) && lookupId > 0) {
      const fromNumeric = await fetchOrderByNumericId(lookupId);
      if (fromNumeric.status !== 'notfound') return fromNumeric;
    }

    // Lookup found the order but queue/single-order fetches missed — still show detail.
    const fromLookup = toShippedOrderFromApi(payload);
    return fromLookup ? { status: 'ok', order: fromLookup } : { status: 'notfound' };
  } catch {
    return { status: 'notfound' };
  }
}
