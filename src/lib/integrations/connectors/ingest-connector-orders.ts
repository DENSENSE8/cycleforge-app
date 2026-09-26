/** The shared ingest call for API order connectors (ShipStation, Shopify, Square, …). */
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

  // Reserve units for what just arrived.
  await autoAllocateAfterIngest(result.insertedOrderIds, { orgId, source });

  return {
    imported: result.insertedOrders,
    // "Existed already" — the counter these connectors have always reported.
    // Deliberately NOT `updatedOrdersFields`, which counts only rows that
    // actually changed and would under-report a no-op re-sync.
    updated: result.processedOrders - result.insertedOrders,
  };
}
