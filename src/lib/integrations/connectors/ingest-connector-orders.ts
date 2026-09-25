/**
 * The shared ingest call for API order connectors (ShipStation, Shopify,
 * Square, …).
 *
 * Each connector used to carry its own copy-pasted `INSERT INTO orders … ON
 * CONFLICT ON CONSTRAINT idx_orders_unique_account_order DO UPDATE …`. They had
 * already drifted (different placeholder titles, ShipStation alone writing a
 * sku), and every new provider added a fourth copy. This routes them all
 * through `ingestCanonicalOrders` with the settings that reproduce that SQL:
 *
 *   • `matchOn: 'accountSourceAndOrderId'` — mirrors the unique constraint.
 *     Marketplace order numbers are only unique per channel, so matching on
 *     `order_id` alone would treat Shopify "1001" and ShipStation "1001" as one
 *     order and delete one of them. A marketplace connector with no row
 *     under its own source claims a legacy `shipstation` row for its number
 *     (see `src/lib/orders/order-source-match.ts`). ShipStation itself does not
 *     come through here: it is an aggregator and calls the writer in
 *     `aggregator` mode (src/lib/integrations/connectors/shipstation.ts).
 *   • `authoritative` — the marketplace is the system of record for the title
 *     and the fulfillment status, so both refresh (status only while the order
 *     is still untouched locally).
 *   • `manageDeadlines: false` — these sources carry no ship-by, and upserting
 *     a null deadline would create an OPEN TEST work assignment for every
 *     synced order, filling the tech queue with already-fulfilled sales.
 *
 * Connectors gain what they previously lacked by not going through the writer:
 * orders-cache invalidation and the realtime `order_changed` publish, so a sync
 * now actually refreshes open dashboards.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import { ingestCanonicalOrders } from '@/lib/orders/ingest-canonical-orders';
import { autoAllocateAfterIngest } from '@/lib/allocation/auto-allocate';

interface ConnectorIngestCounts {
  /** Orders that did not exist before this sync. */
  imported: number;
  /** Orders that already existed (whether or not a field actually changed). */
  updated: number;
}

export async function ingestConnectorOrders(
  orgId: OrgId,
  source: string,
  lines: CanonicalOrderLine[],
  opts?: { fallbackProductTitle?: string },
): Promise<ConnectorIngestCounts> {
  const result = await ingestCanonicalOrders(lines, {
    orgId,
    source,
    matchOn: 'accountSourceAndOrderId',
    authoritative: { productTitle: true, status: true },
    manageDeadlines: false,
    fallbackProductTitle: opts?.fallbackProductTitle,
  });

  // Reserve units for what just arrived. Marketplace connectors are the path
  // most orders enter by, and a reservation made here is what gives the picker
  // a line-grained, location-directed queue before any label exists. Non-fatal
  // by construction — the orders are already written.
  await autoAllocateAfterIngest(result.insertedOrderIds, { orgId, source });

  return {
    imported: result.insertedOrders,
    // "Existed already" — the counter these connectors have always reported.
    // Deliberately NOT `updatedOrdersFields`, which counts only rows that
    // actually changed and would under-report a no-op re-sync.
    updated: result.processedOrders - result.insertedOrders,
  };
}
