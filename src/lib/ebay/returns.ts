/**
 * eBay platform returns: every return request the org's connected eBay seller
 * accounts received in a window — all states, open or closed — rendered into
 * one `ebay_returns` import file (`returns-file.ts`). Nothing here maps a
 * return field into the database.
 *
 * Calls (official Post-Order v2 + Sell Fulfillment v1 contracts):
 * - `GET /post-order/v2/return/search` — returnId, orderId, item id,
 *   quantity, reason (`creationInfo.reason`, ReturnReasonEnum), buyer comments
 *   and creation date. Creation dates older than 18 months are refused by eBay.
 * - `GET /post-order/v2/return/{returnId}?fieldgroups=FULL` — item title and the
 *   buyer's return tracking number (absent from search), and the reason when a
 *   search member lacks it.
 * - `GET /sell/fulfillment/v1/order/{orderId}` — the line's SKU (Post-Order
 *   carries none) and the order number as `orders.order_id` stores it (the
 *   Seller Hub 2-5-5 form the Fulfillment API returns).
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { logger } from '@/lib/observability/logger';
import { ReturnsNotConnectedError } from '@/lib/returns/returns-sync';
import type { ReturnReportFile, ReturnWindow } from '@/lib/returns/return-files';
import { EbayClient } from './client';
import { getEbayAppCreds, listActiveEbayAccounts } from './credentials';
import {
  ebayReturnRecord,
  ebaySearchRanges,
  parseReturnSearchPage,
  renderEbayReturnsFile,
  type EbayReturnRecord,
  type EbayReturnSummary,
} from './returns-file';

const PAGE_SIZE = 200; // the search's documented max
const MAX_PAGES_PER_RANGE = 50;
const DETAIL_CONCURRENCY = 4;

async function mapBounded<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** The slice of `EbayClient` the returns fetch calls — one per seller account. */
export type EbayReturnsClient = Pick<EbayClient, 'searchReturnsPage' | 'getReturnDetail' | 'getOrderDetails'>;

/** Injectable collaborators — real impls by default; fakes in tests. */
export interface EbayReturnFilesDeps {
  /** Active seller accounts with a vaulted refresh token; [] when the org has no eBay app or none. */
  loadSellerAccounts: (orgId: OrgId) => Promise<string[]>;
  clientFor: (orgId: OrgId, accountName: string) => EbayReturnsClient;
  now: () => Date;
}

const defaultDeps: EbayReturnFilesDeps = {
  loadSellerAccounts: async (orgId) => {
    const [creds, accounts] = await Promise.all([getEbayAppCreds(orgId), listActiveEbayAccounts(orgId)]);
    if (!creds) return [];
    return accounts.filter((a) => a.accountRole === 'seller' && a.refreshToken).map((a) => a.accountName);
  },
  clientFor: (orgId, accountName) => new EbayClient(accountName, orgId),
  now: () => new Date(),
};

async function searchAccountReturns(client: EbayReturnsClient, window: ReturnWindow, now: Date): Promise<EbayReturnSummary[]> {
  const members: EbayReturnSummary[] = [];
  for (const range of ebaySearchRanges(window, now)) {
    for (let page = 0, offset = 0; page < MAX_PAGES_PER_RANGE; page++) {
      const { members: batch, total } = parseReturnSearchPage(
        await client.searchReturnsPage({ ...range, limit: PAGE_SIZE, offset }),
      );
      members.push(...batch);
      offset += batch.length;
      if (batch.length < PAGE_SIZE || (total != null && offset >= total)) break;
      if (page === MAX_PAGES_PER_RANGE - 1) {
        logger.warn({ range, offset }, '[ebay-returns] page cap reached; the rest of this range is not read');
      }
    }
  }
  return members;
}

/** The Fulfillment order for a return, or null when eBay will not serve it (the row keeps the return's own order id). */
async function orderFor(client: EbayReturnsClient, orderId: string): Promise<unknown | null> {
  if (!orderId) return null;
  try {
    return await client.getOrderDetails(orderId);
  } catch (err) {
    logger.warn({ orderId, err: err instanceof Error ? err.message : String(err) }, '[ebay-returns] order lookup failed; no SKU for this return');
    return null;
  }
}

/**
 * Every return the org's connected eBay seller accounts received in the
 * window, as one `ebay_returns` file ([] when there were none). Each account
 * stands alone: one whose token refresh or search fails is skipped with a
 * warning naming it, and the others' returns still render. Throws
 * `ReturnsNotConnectedError('ebay')` when the org has no usable connection,
 * and an aggregate error only when every account failed.
 */
export async function fetchEbayReturnFiles(
  orgId: OrgId,
  window: ReturnWindow,
  deps: EbayReturnFilesDeps = defaultDeps,
): Promise<ReturnReportFile[]> {
  const sellers = await deps.loadSellerAccounts(orgId);
  if (sellers.length === 0) throw new ReturnsNotConnectedError('ebay');

  const now = deps.now();
  const byReturnId = new Map<string, EbayReturnRecord>();
  const failures: string[] = [];
  for (const accountName of sellers) {
    try {
      const client = deps.clientFor(orgId, accountName);
      const members = (await searchAccountReturns(client, window, now)).filter((m) => m.returnId && !byReturnId.has(m.returnId));
      const orders = new Map<string, Promise<unknown | null>>();
      const records = await mapBounded(members, DETAIL_CONCURRENCY, async (member) => {
        const orderId = member.orderId ?? '';
        if (!orders.has(orderId)) orders.set(orderId, orderFor(client, orderId));
        const [detail, order] = await Promise.all([client.getReturnDetail(member.returnId), orders.get(orderId)!]);
        return ebayReturnRecord(member, detail, order);
      });
      for (const record of records) byReturnId.set(record.returnId, record);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const hint = /invalid_grant/i.test(message) ? ' (invalid_grant — reconnect this eBay account)' : '';
      const failure = `${accountName}: ${message}${hint}`;
      failures.push(failure);
      console.warn('[ebay/returns] seller account skipped:', failure);
    }
  }
  if (failures.length === sellers.length) {
    throw new Error(`eBay returns failed for every seller account — ${failures.join('; ')}`);
  }

  const records = [...byReturnId.values()].filter((r) => r.orderNumber);
  return records.length ? [renderEbayReturnsFile(records, window)] : [];
}
