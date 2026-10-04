/**
 * eBay buyer purchase → Incoming sync (Universal Incoming Track A, plan §5.3).
 *
 * Every connected buyer account's GetOrders (OrderRole=Buyer) pull is grouped
 * into one `InboundOrderDraft` per eBay order (`ebayPurchaseDrafts`) and
 * landed through `ingestInboundOrder` — the one inbound writer, so the order
 * carries `inbound_order` identity and content-hash idempotency.
 *
 * Redundancy: each run reads a modified-time window that starts
 * `EBAY_PURCHASE_SYNC_OVERLAP_MS` before the last successful run, so missed
 * runs, eBay's modified-time lag and tracking added after the first landing
 * are all re-read. Re-reads cost nothing: an unchanged order is a content-hash
 * no-op, a changed one (tracking appeared, status moved) updates in place. The
 * cursor only advances when the fetch succeeded and no order failed for a
 * retryable reason; a refused (invalid) order never pins it.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getSyncCursor, updateSyncCursor } from '@/lib/sync-cursors';
import {
  fetchBuyerPurchaseOrders,
  MOD_TIME_MAX_MS,
  type BuyerAccountRef,
  type BuyerPurchaseLine,
} from '@/lib/ebay/purchase-client';
import { ingestInboundOrder, InboundOrderRefused, type IngestInboundOrderContext } from './ingest-inbound-order';
import { ebayPurchaseDrafts } from './ebay-purchase-draft';

/** How far before the last successful run each window starts (12 missed 30-min runs + eBay mod-time lag). */
export const EBAY_PURCHASE_SYNC_OVERLAP_MS = 6 * 60 * 60 * 1000;

const SYNC_CONTEXT: IngestInboundOrderContext = { origin: 'sync', source: 'ebay', staffId: null };

/**
 * ModTimeFrom for this run: the last successful run minus the overlap, never
 * older than eBay's 30-day mod-time limit. No cursor → null (first pull, the
 * client's 30-day NumberOfDays).
 */
export function ebayPurchaseWindowStart(cursor: Date | null, nowMs: number): string | null {
  if (!cursor || !Number.isFinite(cursor.getTime())) return null;
  const from = Math.min(cursor.getTime(), nowMs) - EBAY_PURCHASE_SYNC_OVERLAP_MS;
  return new Date(Math.max(from, nowMs - MOD_TIME_MAX_MS)).toISOString();
}

/** Per-order outcome counts — what the cron run summary and the refresh buttons report. */
export interface EbayPurchaseSyncCounts {
  /** New orders landed. */
  landed: number;
  /** Known orders whose content changed (tracking appeared, status moved, lines changed). */
  updated: number;
  /** Re-read inside the overlap window with the same content — no write. */
  unchanged: number;
  failed: number;
}

export interface SyncEbayPurchasesResult extends EbayPurchaseSyncCounts {
  orgId: OrgId;
  accounts: number;
  ordersFetched: number;
  linesFetched: number;
  errors: string[];
}

export type EbayIngest = typeof ingestInboundOrder;

export interface SyncEbayPurchasesDeps {
  listBuyerAccounts: (orgId: OrgId) => Promise<BuyerAccountRef[]>;
  fetchPurchases: (orgId: OrgId, account: BuyerAccountRef, sinceIso: string | null) => Promise<BuyerPurchaseLine[]>;
  ingest: EbayIngest;
  getCursor: (resource: string) => Promise<Date | null>;
  setCursor: (resource: string, at: Date) => Promise<void>;
  now: () => number;
}

export async function listEbayBuyerAccounts(orgId: OrgId): Promise<BuyerAccountRef[]> {
  const r = await tenantQuery<{ account_name: string }>(
    orgId,
    `SELECT account_name
       FROM ebay_accounts
      WHERE organization_id = $1
        AND account_role = 'buyer'
        AND is_active = true
        AND (platform = 'EBAY' OR platform IS NULL)
      ORDER BY account_name`,
    [orgId],
  );
  return r.rows.map((row) => ({ accountName: row.account_name }));
}

export function ebayPurchaseCursorResource(orgId: OrgId, accountName: string): string {
  return `ebay_purchases:${orgId}:${accountName}`;
}

const defaultDeps: SyncEbayPurchasesDeps = {
  listBuyerAccounts: listEbayBuyerAccounts,
  fetchPurchases: fetchBuyerPurchaseOrders,
  ingest: ingestInboundOrder,
  getCursor: getSyncCursor,
  setCursor: updateSyncCursor,
  now: () => Date.now(),
};

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface LandEbayPurchasesResult extends EbayPurchaseSyncCounts {
  orders: number;
  errors: string[];
  /** A failure a re-run could fix (not a refused draft) — the caller must not advance its cursor. */
  retryable: boolean;
}

/** Map one account's fetched lines to drafts and land each order through the one inbound writer. */
export async function landEbayPurchases(
  orgId: OrgId,
  account: BuyerAccountRef,
  lines: readonly BuyerPurchaseLine[],
  ingest: EbayIngest,
): Promise<LandEbayPurchasesResult> {
  const out: LandEbayPurchasesResult = { orders: 0, landed: 0, updated: 0, unchanged: 0, failed: 0, errors: [], retryable: false };
  const skipped = lines.filter((l) => !l.sourceOrderId?.trim()).length;
  if (skipped > 0) out.errors.push(`${account.accountName}: skipped ${skipped} line(s) with no order id`);

  for (const { orderId, draft } of ebayPurchaseDrafts(lines, account.accountName)) {
    out.orders += 1;
    try {
      const r = await ingest(orgId, draft, SYNC_CONTEXT);
      if (r.unchanged) out.unchanged += 1;
      else if (r.created) out.landed += 1;
      else out.updated += 1;
    } catch (e) {
      out.failed += 1;
      if (!(e instanceof InboundOrderRefused)) out.retryable = true;
      out.errors.push(`${account.accountName}/${orderId}: ${msg(e)}`);
    }
  }
  return out;
}

/** Sync every connected buyer account's purchases into Incoming for one org. */
export async function syncEbayPurchasesToReceiving(
  orgId: OrgId,
  deps: SyncEbayPurchasesDeps = defaultDeps,
): Promise<SyncEbayPurchasesResult> {
  const accounts = await deps.listBuyerAccounts(orgId);
  const result: SyncEbayPurchasesResult = {
    orgId,
    accounts: accounts.length,
    ordersFetched: 0,
    linesFetched: 0,
    landed: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    errors: [],
  };

  for (const account of accounts) {
    const resource = ebayPurchaseCursorResource(orgId, account.accountName);
    // The next window is anchored on this run's START, so an order modified
    // while this run pages through GetOrders is re-read next time.
    const runStartedAt = deps.now();
    const since = ebayPurchaseWindowStart(await deps.getCursor(resource), runStartedAt);

    let lines: BuyerPurchaseLine[];
    try {
      lines = await deps.fetchPurchases(orgId, account, since);
    } catch (e) {
      result.errors.push(`${account.accountName}: fetch failed: ${msg(e)}`);
      continue;
    }
    result.linesFetched += lines.length;

    const landed = await landEbayPurchases(orgId, account, lines, deps.ingest);
    result.ordersFetched += landed.orders;
    result.landed += landed.landed;
    result.updated += landed.updated;
    result.unchanged += landed.unchanged;
    result.failed += landed.failed;
    result.errors.push(...landed.errors);

    // A retryable failure keeps the old cursor: the next run re-reads the same
    // window (plus the overlap) and the orders that did land are no-ops.
    if (landed.retryable) continue;
    try {
      await deps.setCursor(resource, new Date(runStartedAt));
    } catch (e) {
      result.errors.push(`${account.accountName}: cursor update failed: ${msg(e)}`);
    }
  }

  return result;
}
