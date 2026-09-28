/** The shared ingest call for API order connectors (ShipStation, Shopify, Square, …). */
import type { OrgId } from '@/lib/tenancy/constants';
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import type { PlatformOf } from '@/lib/orders/order-source-match';
import type { ImportRowRecord } from '@/lib/imports/types';
import { importRowsFromTransferDetails } from '@/lib/imports/from-transfer-details';
import { ingestCanonicalOrders } from '@/lib/orders/ingest-canonical-orders';
import { autoAllocateAfterIngest } from '@/lib/allocation/auto-allocate';
import { listPlatformAccounts, listPlatforms } from '@/lib/neon/catalog-queries';
import { buildAccountSourceLookup } from '@/lib/platform-display';

interface ConnectorIngestCounts {
  /** Orders that did not exist before this sync. */
  imported: number;
  /** Orders that already existed (whether or not a field actually changed). */
  updated: number;
  /** Every order the write touched, with its ids — `SyncOutcome.importRows`. */
  importRows: ImportRowRecord[];
}

/** The org's account_source → catalog platform slug (the import record's `platform`). */
export async function loadOrgPlatformOf(orgId: OrgId): Promise<PlatformOf> {
  const [platforms, accounts] = await Promise.all([
    listPlatforms(orgId, { includeInactive: true }),
    listPlatformAccounts(orgId, { includeInactive: true }),
  ]);
  const lookup = buildAccountSourceLookup(platforms, accounts);
  return (source) => lookup(source).platform?.slug.trim().toLowerCase() ?? null;
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

  const touched = result.details.inserted.length + result.details.updated.length + result.details.ambiguous.length;
  return {
    imported: result.insertedOrders,
    // "Existed already" — the counter these connectors have always reported.
    // Deliberately NOT `updatedOrdersFields`, which counts only rows that
    // actually changed and would under-report a no-op re-sync.
    updated: result.processedOrders - result.insertedOrders,
    importRows:
      touched > 0 ? importRowsFromTransferDetails(result.details, { platformOf: await loadOrgPlatformOf(orgId) }) : [],
  };
}
