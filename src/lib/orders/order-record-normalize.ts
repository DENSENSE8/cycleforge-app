/**
 * Shared order-row normalize / dedupe — safe for RSC seeds and client fetch
 * post-process. Kept free of `'use client'` so server seed helpers can import
 * without pulling the dashboard relative-fetch graph.
 */
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { isFbaOrder } from '@/utils/order-platform';

/** Map a raw `/api/orders` row onto the canonical {@link ShippedOrder} shape. */
export function toOrderRecord(order: Record<string, unknown> | ShippedOrder): ShippedOrder {
  const o = order as Record<string, any>;
  const primaryTracking = o.shipping_tracking_number || o.tracking_number || null;
  const trackingNumbers = Array.isArray(o.tracking_numbers)
    ? o.tracking_numbers.map((v: unknown) => String(v || '').trim()).filter(Boolean)
    : primaryTracking
      ? [String(primaryTracking).trim()]
      : [];
  const trackingNumberRows = Array.isArray(o.tracking_number_rows)
    ? o.tracking_number_rows
      .map((row: any) => ({
        shipment_id: Number.isFinite(Number(row?.shipment_id)) ? Number(row.shipment_id) : null,
        tracking: String(row?.tracking ?? row?.tracking_number_raw ?? '').trim(),
        is_primary: Boolean(row?.is_primary),
      }))
      .filter((row: any) => row.tracking)
    : [];
  const mergedTrackingNumbers =
    trackingNumbers.length > 0
      ? trackingNumbers
      : trackingNumberRows.map((row: any) => row.tracking).filter(Boolean);
  return {
    ...o,
    deadline_at: o.deadline_at || null,
    shipment_id: o.shipment_id ?? null,
    sale_amount: o.sale_amount ?? null,
    currency: o.currency ?? null,
    packed_at: o.packed_at || null,
    packed_by: o.packed_by ?? null,
    tested_by: o.tested_by ?? null,
    serial_number: o.serial_number || '',
    condition: o.condition || '',
    shipping_tracking_number: primaryTracking,
    tracking_numbers: mergedTrackingNumbers,
    tracking_number_rows: trackingNumberRows,
    row_source: o.row_source || 'order',
    exception_reason: o.exception_reason || null,
    exception_status: o.exception_status || null,
  } as ShippedOrder;
}

export function isNonFbaRecord(record: ShippedOrder): boolean {
  return !isFbaOrder(record.order_id, record.account_source);
}

export function dedupeByOrderId(records: ShippedOrder[]): ShippedOrder[] {
  const seen = new Map<string, ShippedOrder>();
  for (const record of records) {
    const orderKey = String(record.order_id || '').trim();
    const key = orderKey || `id:${record.id}`;
    if (!seen.has(key)) {
      seen.set(key, record);
    }
  }
  return Array.from(seen.values());
}

function productKeyOf(record: ShippedOrder): string {
  const cat = (record as { sku_catalog_id?: unknown }).sku_catalog_id;
  if (cat != null && String(cat).trim() !== '') return `cat:${String(cat).trim()}`;
  const sku = String(record.sku || '').trim().toLowerCase();
  if (sku) return `sku:${sku}`;
  const title = String(record.product_title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return title ? `title:${title}` : '';
}

/**
 * Collapse only TRUE duplicates — rows sharing both an order number AND a
 * product identity. Distinct products under one order survive as separate rows.
 */
function dedupeByOrderProduct(records: ShippedOrder[]): ShippedOrder[] {
  const ordersWithRealProduct = new Set<string>();
  for (const record of records) {
    const orderKey = String(record.order_id || '').trim();
    if (orderKey && productKeyOf(record)) ordersWithRealProduct.add(orderKey);
  }

  const seen = new Map<string, ShippedOrder>();
  for (const record of records) {
    const orderKey = String(record.order_id || '').trim();
    const pk = productKeyOf(record);
    let key: string;
    if (!orderKey) {
      key = `id:${record.id}`;
    } else if (pk) {
      key = `${orderKey}::${pk}`;
    } else if (ordersWithRealProduct.has(orderKey)) {
      continue;
    } else {
      key = `${orderKey}::__blank__`;
    }
    if (!seen.has(key)) seen.set(key, record);
  }
  return Array.from(seen.values());
}

/** Normalize API `orders` payload into the Unshipped table row list. */
export function normalizeUnshippedOrdersPayload(orders: unknown[]): ShippedOrder[] {
  return dedupeByOrderProduct(
    (orders || []).map((o) => toOrderRecord(o as Record<string, unknown>)).filter(isNonFbaRecord),
  );
}
