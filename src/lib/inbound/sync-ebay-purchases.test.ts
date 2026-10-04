import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  EBAY_PURCHASE_SYNC_OVERLAP_MS,
  ebayPurchaseWindowStart,
  syncEbayPurchasesToReceiving,
  type SyncEbayPurchasesDeps,
} from './sync-ebay-purchases';
import { InboundOrderRefused, type IngestInboundOrderResult } from './ingest-inbound-order';
import { inboundOrderFingerprint, inboundOrderIdentity, type InboundOrderDraft } from './inbound-order-draft';
import { MOD_TIME_MAX_MS, type BuyerAccountRef, type BuyerPurchaseLine } from '@/lib/ebay/purchase-client';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as unknown as OrgId;
const NOW = Date.parse('2026-10-03T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

/**
 * Emulates ingestInboundOrder's identity + content-hash contract: one order per
 * (source, platform, normalized number); the same content is `unchanged`, new
 * content on a known order is an update, never a second order.
 */
function fakeWriter() {
  const orders = new Map<string, { id: number; hash: string }>();
  const landed: InboundOrderDraft[] = [];
  const ingest = (async (_org: OrgId, raw: unknown) => {
    const draft = raw as InboundOrderDraft;
    const identity = inboundOrderIdentity(draft);
    const key = `${identity.sourceType}:${identity.sourcePlatform}:${identity.externalOrderIdNorm}`;
    const hash = createHash('sha256').update(inboundOrderFingerprint(draft)).digest('hex');
    const prior = orders.get(key);
    landed.push(draft);
    const result = (id: number, created: boolean, unchanged: boolean): IngestInboundOrderResult => ({
      inboundOrderId: id, created, unchanged, identity, lines: [], receivingId: null, localPickupOrderId: null,
    });
    if (prior && prior.hash === hash) return result(prior.id, false, true);
    const id = prior?.id ?? orders.size + 1;
    orders.set(key, { id, hash });
    return result(id, !prior, false);
  }) as SyncEbayPurchasesDeps['ingest'];
  return { ingest, orders, landed };
}

function fakes(opts: {
  accounts?: BuyerAccountRef[];
  linesByAccount?: Record<string, BuyerPurchaseLine[]>;
  fetchThrowsFor?: string;
  ingest?: SyncEbayPurchasesDeps['ingest'];
  cursor?: Date | null;
} = {}) {
  const writer = fakeWriter();
  const cursorsSet: Array<{ resource: string; at: string }> = [];
  const sinces: Array<string | null> = [];
  const deps: SyncEbayPurchasesDeps = {
    listBuyerAccounts: async () => opts.accounts ?? [],
    fetchPurchases: async (_o, account, since) => {
      sinces.push(since);
      if (opts.fetchThrowsFor === account.accountName) throw new Error('boom');
      return opts.linesByAccount?.[account.accountName] ?? [];
    },
    ingest: opts.ingest ?? writer.ingest,
    getCursor: async () => opts.cursor ?? null,
    setCursor: async (resource, at) => { cursorsSet.push({ resource, at: at.toISOString() }); },
    now: () => NOW,
  };
  return { deps, writer, cursorsSet, sinces };
}

const line = (over: Partial<BuyerPurchaseLine>): BuyerPurchaseLine => ({
  sourceOrderId: '12-34567-89012',
  itemName: 'Bose SoundLink',
  quantity: 1,
  sellerUsername: 'parts_seller',
  vendorOrSellerName: 'parts_seller',
  ...over,
});

test('no buyer accounts → zero result', async () => {
  const { deps } = fakes({ accounts: [] });
  const r = await syncEbayPurchasesToReceiving(ORG, deps);
  assert.deepEqual(r, {
    orgId: ORG, accounts: 0, ordersFetched: 0, linesFetched: 0,
    landed: 0, updated: 0, unchanged: 0, failed: 0, errors: [],
  });
});

test('one draft per eBay order: transactions become lines, lands through the one writer', async () => {
  const { deps, writer, cursorsSet } = fakes({
    accounts: [{ accountName: 'USAV-Buyer' }],
    linesByAccount: { 'USAV-Buyer': [
      line({ sourceLineItemId: '111-1', itemId: '111', quantity: 2, unitCostCents: 2499 }),
      line({ sourceLineItemId: '222-1', itemId: '222', itemName: 'Cable' }),
      line({ sourceOrderId: '99-888', sourceLineItemId: '333-1', itemName: 'Widget' }),
    ] },
  });
  const r = await syncEbayPurchasesToReceiving(ORG, deps);
  assert.equal(r.linesFetched, 3);
  assert.equal(r.ordersFetched, 2);
  assert.equal(r.landed, 2);
  assert.equal(writer.landed.length, 2, 'one ingest per order, not per line');
  const [first] = writer.landed;
  assert.equal(first.platform, 'ebay');
  assert.equal(first.accountName, 'USAV-Buyer');
  assert.deepEqual(first.lines.map((l) => [l.lineKey, l.quantity, l.unitCostCents, l.itemNumber]), [
    ['111-1', 2, 2499, '111'],
    ['222-1', 1, null, '222'],
  ]);
  assert.deepEqual(cursorsSet, [{ resource: `ebay_purchases:${ORG}:USAV-Buyer`, at: new Date(NOW).toISOString() }]);
});

test('tracking that appears on a later run updates the order; a re-read after that is unchanged', async () => {
  const account = { accountName: 'B1' };
  const noTracking = [line({ sourceLineItemId: '111-1' })];
  const withTracking = [line({ sourceLineItemId: '111-1', trackingNumber: '9400111899223344556677', carrierCode: 'USPS' })];

  const linesByAccount: Record<string, BuyerPurchaseLine[]> = { B1: noTracking };
  const { deps, writer } = fakes({ accounts: [account], linesByAccount });

  const first = await syncEbayPurchasesToReceiving(ORG, deps);
  assert.deepEqual([first.landed, first.updated, first.unchanged], [1, 0, 0]);

  linesByAccount.B1 = withTracking;
  const second = await syncEbayPurchasesToReceiving(ORG, deps);
  assert.deepEqual([second.landed, second.updated, second.unchanged], [0, 1, 0], 'tracking added → updated');

  const third = await syncEbayPurchasesToReceiving(ORG, deps);
  assert.deepEqual([third.landed, third.updated, third.unchanged], [0, 0, 1], 'overlap re-read is a no-op');

  assert.equal(writer.orders.size, 1, 'never a second order');
  assert.deepEqual(writer.landed[1].tracking, [{ number: '9400111899223344556677', carrier: 'USPS' }]);
});

test('window: first pull has no cursor; later pulls start the overlap before the last run', async () => {
  const fresh = fakes({ accounts: [{ accountName: 'B1' }] });
  await syncEbayPurchasesToReceiving(ORG, fresh.deps);
  assert.deepEqual(fresh.sinces, [null]);

  const lastRun = new Date(NOW - 30 * 60 * 1000);
  const delta = fakes({ accounts: [{ accountName: 'B1' }], cursor: lastRun });
  await syncEbayPurchasesToReceiving(ORG, delta.deps);
  assert.deepEqual(delta.sinces, [new Date(lastRun.getTime() - EBAY_PURCHASE_SYNC_OVERLAP_MS).toISOString()]);
});

test('ebayPurchaseWindowStart boundaries', () => {
  assert.equal(ebayPurchaseWindowStart(null, NOW), null);
  assert.equal(ebayPurchaseWindowStart(new Date('not a date'), NOW), null);
  // Several missed runs: the window still reaches back to the last success, minus the overlap.
  assert.equal(
    ebayPurchaseWindowStart(new Date(NOW - 5 * HOUR), NOW),
    new Date(NOW - 5 * HOUR - EBAY_PURCHASE_SYNC_OVERLAP_MS).toISOString(),
  );
  // A cursor ahead of the clock (skew) is treated as now.
  assert.equal(
    ebayPurchaseWindowStart(new Date(NOW + HOUR), NOW),
    new Date(NOW - EBAY_PURCHASE_SYNC_OVERLAP_MS).toISOString(),
  );
  // Exactly at eBay's 30-day mod-time limit, and beyond it: clamped to the limit.
  const floor = new Date(NOW - MOD_TIME_MAX_MS).toISOString();
  assert.equal(ebayPurchaseWindowStart(new Date(NOW - MOD_TIME_MAX_MS + EBAY_PURCHASE_SYNC_OVERLAP_MS), NOW), floor);
  assert.equal(ebayPurchaseWindowStart(new Date(NOW - 90 * 24 * HOUR), NOW), floor);
  assert.equal(
    ebayPurchaseWindowStart(new Date(NOW - MOD_TIME_MAX_MS + EBAY_PURCHASE_SYNC_OVERLAP_MS + 1), NOW),
    new Date(NOW - MOD_TIME_MAX_MS + 1).toISOString(),
  );
});

test('a line with no order id is skipped and reported; the rest land', async () => {
  const { deps, writer } = fakes({
    accounts: [{ accountName: 'B1' }],
    linesByAccount: { B1: [{ sourceOrderId: '' }, line({ sourceOrderId: 'E-9' })] },
  });
  const r = await syncEbayPurchasesToReceiving(ORG, deps);
  assert.equal(r.landed, 1);
  assert.equal(writer.landed[0].orderNumber, 'E-9');
  assert.equal(r.errors.length, 1);
});

test('a retryable order failure is isolated and holds the cursor for the next run', async () => {
  const writer = fakeWriter();
  const { deps, cursorsSet } = fakes({
    accounts: [{ accountName: 'B1' }],
    linesByAccount: { B1: [line({ sourceOrderId: 'E-1' }), line({ sourceOrderId: 'E-2' })] },
    ingest: (async (org: OrgId, raw: unknown, ctx: Parameters<SyncEbayPurchasesDeps['ingest']>[2]) => {
      if ((raw as InboundOrderDraft).orderNumber === 'E-1') throw new Error('deadlock detected');
      return writer.ingest(org, raw, ctx);
    }) as SyncEbayPurchasesDeps['ingest'],
  });
  const r = await syncEbayPurchasesToReceiving(ORG, deps);
  assert.deepEqual([r.landed, r.failed], [1, 1]);
  assert.match(r.errors[0], /B1\/E-1: deadlock/);
  assert.deepEqual(cursorsSet, [], 'cursor kept so E-1 is re-read');
});

test('a refused (invalid) order is counted but does not pin the cursor', async () => {
  const { deps, cursorsSet } = fakes({
    accounts: [{ accountName: 'B1' }],
    linesByAccount: { B1: [line({ sourceOrderId: 'E-1' })] },
    ingest: (async () => { throw new InboundOrderRefused('Still need: quantity.', 400); }) as SyncEbayPurchasesDeps['ingest'],
  });
  const r = await syncEbayPurchasesToReceiving(ORG, deps);
  assert.equal(r.failed, 1);
  assert.equal(cursorsSet.length, 1);
});

test('a fetch failure skips the account (no cursor advance) but not the org', async () => {
  const { deps, cursorsSet } = fakes({
    accounts: [{ accountName: 'bad' }, { accountName: 'good' }],
    linesByAccount: { good: [line({ sourceOrderId: 'E-1' })] },
    fetchThrowsFor: 'bad',
  });
  const r = await syncEbayPurchasesToReceiving(ORG, deps);
  assert.equal(r.accounts, 2);
  assert.equal(r.landed, 1);
  assert.ok(r.errors.some((e) => /bad: fetch failed/.test(e)));
  assert.deepEqual(cursorsSet.map((c) => c.resource), [`ebay_purchases:${ORG}:good`], 'failed account cursor not advanced');
});
