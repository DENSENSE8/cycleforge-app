/**
 * ShipStation connector sync adapter — connection-driven order ingestion.
 *
 * Pulls the org's orders through the LEGACY v1 API (the only ShipStation surface
 * that returns orders with SKUs + weight; v2 has no order-list endpoint) and
 * upserts them into `orders` with the SAME uniform shape eBay/Amazon/Square use
 * (account_source / sale_amount / currency), so every downstream surface renders
 * generically. Rate/label BUYING is v2 (src/lib/shipping/shipstation/*).
 *
 * Reuses:
 *   - getShipStationV1 (vault creds → bound v1 client)
 *   - the orders upsert shape from src/lib/integrations/connectors/square.ts
 *     (idx_orders_unique_account_order)
 *   - getSyncCursor / updateSyncCursor for the incremental modifyDate watermark
 *
 * Ship-to is NOT written to `customers` here; the rate/label endpoints fetch the
 * authoritative ship-to + stored weight live from the v1 order. Populating
 * `customers` at sync time is a documented follow-up.
 *
 * Lazily imported by the registry so the connection reader never bundles the
 * ShipStation client.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import { ingestConnectorOrders } from './ingest-connector-orders';
import { getSyncCursor, updateSyncCursor } from '@/lib/sync-cursors';
import { getShipStationV1 } from '@/lib/shipping/shipstation/config';
import type { ShipStationV1Order } from '@/lib/shipping/shipstation/orders-v1';
import type { SyncOutcome } from './types';

const ACCOUNT_SOURCE = 'shipstation';
const FIRST_RUN_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 25; // safety bound: 25 * 100 = 2.5k orders / run

/** One representative line for the orders row (v1 orders are multi-line). */
function summarizeItems(order: ShipStationV1Order): { title: string; quantity: number } {
  const items = order.items ?? [];
  const quantity = items.reduce((s, it) => s + (it.quantity || 0), 0) || 1;
  const first = items.find((it) => (it.name ?? '').trim())?.name?.trim();
  const title = !first
    ? `ShipStation order ${order.orderNumber}`
    : items.length > 1
      ? `${first} +${items.length - 1} more`
      : first;
  return { title, quantity };
}

/** ShipStation status → our orders.status. awaiting_shipment lands in the
 *  outbound "needs a label" queue (unassigned); shipped is terminal. */
function mapStatus(orderStatus: string | null): string {
  return (orderStatus ?? '').toLowerCase() === 'shipped' ? 'shipped' : 'unassigned';
}

/**
 * Map a ShipStation order to a canonical line.
 *
 * ShipStation always produces a non-empty title (it falls back to
 * `ShipStation order <n>`), which is why its upsert refreshed the title on
 * every sync — reproduced here by the connector's `authoritative.productTitle`.
 */
function toCanonicalLine(order: ShipStationV1Order): CanonicalOrderLine {
  const { title, quantity } = summarizeItems(order);
  return {
    externalOrderId: String(order.orderNumber ?? ''),
    itemNumber: '',
    sku: order.items.find((it) => (it.sku ?? '').trim())?.sku?.trim() || '',
    productTitle: title,
    condition: '',
    quantity: String(quantity),
    notes: '',
    // No buyer name on this adapter's payload yet; when it is wired, match on
    // ShipStation's customer id/email rather than routing a name through
    // `customerName` (name-only matching is the weakest identity signal).
    customerName: '',
    accountSource: ACCOUNT_SOURCE,
    trackings: [],
    shipByDate: null,
    orderDate: order.orderDate ? new Date(order.orderDate) : null,
    saleAmount: order.orderTotal != null ? String(order.orderTotal) : null,
    currency: 'USD',
    // awaiting_shipment lands in the outbound "needs a label" queue
    // (unassigned); shipped is terminal.
    status: mapStatus(order.orderStatus),
  };
}

export async function shipstationSync(orgId: OrgId): Promise<SyncOutcome> {
  const client = await getShipStationV1(orgId);
  if (!client) {
    return {
      ok: false,
      error:
        'shipstation: legacy v1 API key/secret not configured — order pull needs the v1 credentials (v2 has no order-list endpoint).',
    };
  }

  const cursorKey = `shipstation:orders:${orgId}`;
  let imported = 0;
  let updated = 0;
  const since = (await getSyncCursor(cursorKey)) ?? new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);
  let maxModified = since.getTime();
  const lines: CanonicalOrderLine[] = [];

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await client.listOrders({
        modifyDateStart: since.toISOString(),
        page,
        pageSize: PAGE_SIZE,
      });

      for (const order of res.orders) {
        // Skip cancelled orders — they must never land in the labels queue.
        if ((order.orderStatus ?? '').toLowerCase() === 'cancelled') continue;
        lines.push(toCanonicalLine(order));
        const ts = order.modifyDate ? Date.parse(order.modifyDate) : NaN;
        if (Number.isFinite(ts) && ts > maxModified) maxModified = ts;
      }

      if (page >= res.pages) break;
    }

    // One ingest for the whole run, so the cache bust + realtime publish fire
    // once rather than per page.
    const counts = await ingestConnectorOrders(orgId, ACCOUNT_SOURCE, lines);
    imported = counts.imported;
    updated = counts.updated;

    // Advance the watermark only on a clean run so a failure re-pulls.
    if (maxModified > since.getTime()) {
      await updateSyncCursor(cursorKey, new Date(maxModified));
    }
  } catch (e) {
    return { ok: false, error: `shipstation: ${e instanceof Error ? e.message : String(e)}` };
  }

  return {
    ok: true,
    imported,
    updated,
    cursor: new Date(maxModified).toISOString(),
  };
}
