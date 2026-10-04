/** Per-order inbound marketplace resync — re-pull one eBay (or future Amazon) buyer purchase onto the Incoming spine and re-poll its… */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { isIncomingUniversal } from '@/lib/feature-flags';
import { syncShipment } from '@/lib/shipping/sync-shipment';
import { resolveInboundSettings, isInboundSourceEnabled } from './org-settings';
import {
  ebayPurchaseCursorResource,
  ebayPurchaseWindowStart,
  landEbayPurchases,
  listEbayBuyerAccounts,
  syncEbayPurchasesToReceiving,
  type EbayIngest,
  type EbayPurchaseSyncCounts,
} from './sync-ebay-purchases';
import {
  fetchBuyerPurchaseOrders,
  type BuyerAccountRef,
  type BuyerPurchaseLine,
} from '@/lib/ebay/purchase-client';
import { ingestInboundOrder } from './ingest-inbound-order';
import { getSyncCursor } from '@/lib/sync-cursors';
import { assertRegisteredInboundSource } from './source-registry';

interface SyncOneInboundInput {
  sourceType: string;
  sourceOrderId: string;
  /** Buyer account label when known (narrows the account sweep). */
  accountLabel?: string | null;
}

interface SyncOneInboundMarketplaceResult extends EbayPurchaseSyncCounts {
  linesFetched: number;
  accounts: number;
  errors: string[];
}

interface SyncOneInboundShipmentResult {
  polled: boolean;
  status?: string | null;
  error?: string | null;
}

interface SyncOneInboundResult {
  ok: boolean;
  sourceType: string;
  sourceOrderId: string;
  marketplace: SyncOneInboundMarketplaceResult | null;
  shipment: SyncOneInboundShipmentResult;
  /** Operator-facing note when nothing changed or API is not live yet. */
  note: string | null;
  error: string | null;
}

export interface SyncOneInboundDeps {
  isUniversalEnabled: (orgId: OrgId) => Promise<boolean>;
  resolveSettings: typeof resolveInboundSettings;
  listBuyerAccounts: (orgId: OrgId) => Promise<BuyerAccountRef[]>;
  fetchPurchases: typeof fetchBuyerPurchaseOrders;
  ingest: EbayIngest;
  getCursor: typeof getSyncCursor;
  syncAllEbay: typeof syncEbayPurchasesToReceiving;
  findShipmentId: (orgId: OrgId, sourceType: string, sourceOrderId: string) => Promise<number | null>;
  pollShipment: typeof syncShipment;
  now: () => number;
}

async function defaultFindShipmentId(
  orgId: OrgId,
  sourceType: string,
  sourceOrderId: string,
): Promise<number | null> {
  const r = await tenantQuery<{ shipment_id: number | null }>(
    orgId,
    `SELECT r.shipment_id
       FROM inbound_purchase_order_links l
       JOIN receiving_line rl ON rl.id = l.receiving_line_id
       LEFT JOIN receiving_carton r ON r.id = rl.receiving_id
      WHERE l.organization_id = $1
        AND l.source_type = $2
        AND l.source_order_id = $3
        AND rl.organization_id = $1
      ORDER BY l.is_primary DESC, l.id ASC
      LIMIT 1`,
    [orgId, sourceType, sourceOrderId],
  );
  return r.rows[0]?.shipment_id ?? null;
}

function lineMatchesOrder(line: BuyerPurchaseLine, orderId: string): boolean {
  const id = orderId.trim();
  if (!id) return false;
  return (
    line.sourceOrderId === id
    || (line.legacyOrderId != null && line.legacyOrderId === id)
    || (line.orderNumber != null && line.orderNumber === id)
  );
}

const defaultDeps: SyncOneInboundDeps = {
  isUniversalEnabled: isIncomingUniversal,
  resolveSettings: resolveInboundSettings,
  listBuyerAccounts: listEbayBuyerAccounts,
  fetchPurchases: fetchBuyerPurchaseOrders,
  ingest: ingestInboundOrder,
  getCursor: getSyncCursor,
  syncAllEbay: syncEbayPurchasesToReceiving,
  findShipmentId: defaultFindShipmentId,
  pollShipment: syncShipment,
  now: () => Date.now(),
};

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function syncEbayOrderTargeted(
  orgId: OrgId,
  input: SyncOneInboundInput,
  deps: SyncOneInboundDeps,
): Promise<SyncOneInboundMarketplaceResult> {
  const orderId = input.sourceOrderId.trim();
  let accounts = await deps.listBuyerAccounts(orgId);
  const label = input.accountLabel?.trim();
  if (label) accounts = accounts.filter((a) => a.accountName === label);

  const out: SyncOneInboundMarketplaceResult = {
    accounts: accounts.length,
    linesFetched: 0,
    landed: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    errors: [],
  };

  if (accounts.length === 0) {
    out.errors.push(
      label
        ? `No active eBay buyer account "${label}" is connected.`
        : 'No connected eBay buyer accounts — add one under Settings → Integrations.',
    );
    return out;
  }

  for (const account of accounts) {
    // Same overlapping window the scheduled sync reads; the cursor is the cron's to advance.
    const since = ebayPurchaseWindowStart(
      await deps.getCursor(ebayPurchaseCursorResource(orgId, account.accountName)),
      deps.now(),
    );
    let lines: BuyerPurchaseLine[];
    try {
      lines = await deps.fetchPurchases(orgId, account, since);
    } catch (e) {
      out.errors.push(`${account.accountName}: fetch failed: ${msg(e)}`);
      continue;
    }
    // Every line of a matched order lands, so the draft is the whole order.
    const orderIds = new Set(lines.filter((l) => lineMatchesOrder(l, orderId)).map((l) => l.sourceOrderId));
    const matches = lines.filter((l) => orderIds.has(l.sourceOrderId));
    out.linesFetched += matches.length;

    const landed = await landEbayPurchases(orgId, account, matches, deps.ingest);
    out.landed += landed.landed;
    out.updated += landed.updated;
    out.unchanged += landed.unchanged;
    out.failed += landed.failed;
    out.errors.push(...landed.errors);
  }

  // The order is outside the window (unmodified since the last run): fall back
  // to the org-wide sync so the operator's click still runs the cron's pipeline.
  if (out.linesFetched === 0) {
    const bulk = await deps.syncAllEbay(orgId);
    out.linesFetched = bulk.linesFetched;
    out.landed = bulk.landed;
    out.updated = bulk.updated;
    out.unchanged = bulk.unchanged;
    out.failed = bulk.failed;
    if (bulk.errors.length) out.errors.push(...bulk.errors);
  }

  return out;
}

/**
 * Re-sync one marketplace inbound order: pull from linked buyer accounts, then
 * re-poll carrier tracking when a shipment is attached.
 */
export async function syncOneInboundPurchase(
  orgId: OrgId,
  input: SyncOneInboundInput,
  deps: SyncOneInboundDeps = defaultDeps,
): Promise<SyncOneInboundResult> {
  const sourceType = input.sourceType.trim().toLowerCase();
  const sourceOrderId = input.sourceOrderId.trim();

  try {
    assertRegisteredInboundSource(sourceType);
  } catch (e) {
    return {
      ok: false,
      sourceType,
      sourceOrderId,
      marketplace: null,
      shipment: { polled: false },
      note: null,
      error: msg(e),
    };
  }

  if (!sourceOrderId) {
    return {
      ok: false,
      sourceType,
      sourceOrderId,
      marketplace: null,
      shipment: { polled: false },
      note: null,
      error: 'source_order_id is required',
    };
  }

  if (!(await deps.isUniversalEnabled(orgId))) {
    return {
      ok: false,
      sourceType,
      sourceOrderId,
      marketplace: null,
      shipment: { polled: false },
      note: null,
      error: 'Universal Incoming is not enabled for this organization.',
    };
  }

  const settings = await deps.resolveSettings(orgId);
  if (!isInboundSourceEnabled(settings, sourceType)) {
    return {
      ok: false,
      sourceType,
      sourceOrderId,
      marketplace: null,
      shipment: { polled: false },
      note: null,
      error: `Inbound source "${sourceType}" is not enabled for this organization.`,
    };
  }

  let marketplace: SyncOneInboundMarketplaceResult | null = null;
  let note: string | null = null;

  if (sourceType === 'ebay') {
    marketplace = await syncEbayOrderTargeted(orgId, input, deps);
    if (marketplace.linesFetched === 0) {
      note = 'No new marketplace lines for this order — tracking was re-polled if present.';
    }
  } else if (sourceType === 'amazon') {
    return {
      ok: false,
      sourceType,
      sourceOrderId,
      marketplace: null,
      shipment: { polled: false },
      note: null,
      error: 'Amazon inbound purchase sync is not available yet.',
    };
  } else {
    return {
      ok: false,
      sourceType,
      sourceOrderId,
      marketplace: null,
      shipment: { polled: false },
      note: null,
      error: `Automatic resync is not supported for inbound source "${sourceType}".`,
    };
  }

  let shipment: SyncOneInboundShipmentResult = { polled: false };
  const shipmentId = await deps.findShipmentId(orgId, sourceType, sourceOrderId);
  if (shipmentId != null) {
    try {
      const r = await deps.pollShipment({ shipmentId });
      shipment = r.ok
        ? { polled: true, status: r.status ?? null }
        : { polled: false, error: r.error ?? r.errorCode ?? 'sync failed' };
    } catch (e) {
      shipment = { polled: false, error: msg(e) };
    }
  }

  const hardError = marketplace.errors.find((e) => /No connected eBay buyer/.test(e))
    ?? (marketplace.accounts === 0 ? marketplace.errors[0] : null);

  const reached = marketplace.landed + marketplace.updated + marketplace.unchanged;
  const ok = !hardError && (reached > 0 || shipment.polled || Boolean(note));

  return {
    ok,
    sourceType,
    sourceOrderId,
    marketplace,
    shipment,
    note,
    error: hardError,
  };
}
