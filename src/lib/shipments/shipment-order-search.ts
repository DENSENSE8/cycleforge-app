/**
 * Order-line search for "link this package to an order" — the unmatched pack
 * scan resolver on the Shipped desk record and the phone hub.
 *
 * Reads the existing orders feed (`GET /api/orders?q=&includeShipped=true`),
 * which already answers an order #, a tracking # or a title; this module only
 * narrows its wide row to the few facts a picker paints. No new endpoint.
 */

export interface LinkableOrderLine {
  /** `orders.id` — the `orderRowId` a link-order resolve sends. */
  orderRowId: number;
  orderRef: string | null;
  title: string;
  sku: string | null;
  channel: string | null;
  status: string | null;
  quantity: number | null;
  /** The line's primary package (`orders.shipment_id`), when it has one. */
  shipmentId: number | null;
}

const LIMIT = 20;

function text(value: unknown): string | null {
  const face = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return face || null;
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Narrow one `/api/orders` row; null when it names no order line. */
export function toLinkableOrderLine(raw: Record<string, unknown>): LinkableOrderLine | null {
  const orderRowId = positiveInt(raw.id);
  if (orderRowId == null) return null;
  const quantity = Number(raw.quantity);
  return {
    orderRowId,
    orderRef: text(raw.order_id),
    title: text(raw.product_title) ?? '',
    sku: text(raw.sku),
    channel: text(raw.account_source),
    status: text(raw.status),
    quantity: Number.isFinite(quantity) ? quantity : null,
    shipmentId: positiveInt(raw.shipment_id),
  };
}

/** Order lines matching `query` (order #, tracking #, title), open and shipped. */
export async function searchLinkableOrders(query: string, signal?: AbortSignal): Promise<LinkableOrderLine[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({ q, includeShipped: 'true', limit: String(LIMIT) });
  const res = await fetch(`/api/orders?${params.toString()}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`Order search failed (${res.status})`);
  const body = (await res.json()) as { orders?: Record<string, unknown>[] };
  const rows = Array.isArray(body.orders) ? body.orders : [];
  const lines: LinkableOrderLine[] = [];
  for (const row of rows) {
    const line = toLinkableOrderLine(row);
    if (line) lines.push(line);
  }
  return lines;
}

/** The package an order line ships in (`?openOrderId=` legacy bookmarks), or null. */
export async function fetchOrderLinePackageId(orderRowId: number, signal?: AbortSignal): Promise<number | null> {
  const res = await fetch(`/api/orders?orderId=${orderRowId}&includeShipped=true`, { cache: 'no-store', signal });
  if (!res.ok) return null;
  const body = (await res.json()) as { orders?: Record<string, unknown>[] };
  const row = Array.isArray(body.orders) ? body.orders[0] : undefined;
  return row ? positiveInt(row.shipment_id) : null;
}
