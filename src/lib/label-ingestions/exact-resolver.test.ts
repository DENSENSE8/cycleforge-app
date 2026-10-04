import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBuyerName, pickBuyerOrder, resolveExactLabelOrder, type BuyerOrderCandidate } from './exact-resolver';
import type { ParsedLabelEvidence } from './types';

const org = '00000000-0000-4000-8000-000000000001' as never;
const evidence: ParsedLabelEvidence = { parserVersion: 'v2', cycleforgeReference: null, marketplaceOrderId: null, accountSource: null, trackingNumberRaw: '9400 1502 0621 7932 8307 94', trackingNumberNormalized: '9400150206217932830794', carrier: 'USPS', multiPackageEvidence: false, shipToName: 'KATHARINE K. DORAN' };

/** A fake client answering the resolver's three reads: tracking → orders, buyer → orders, labeled order rows. */
function fakeClient(db: { tracked?: Array<{ id: number; account_source: string; order_id: string }>; buyers?: Array<{ id: number; account_source: string; order_id: string; ordered_at: string; buyer: string }>; labeled?: number[] }) {
  const sql: string[] = [];
  return {
    sql,
    client: {
      query: async (text: string) => {
        sql.push(text);
        if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
        if (text.includes('shipstation_shipment_refs')) return { rows: db.tracked ?? [] };
        if (text.includes('WITH named')) return { rows: (db.buyers ?? []).map((row) => ({ ...row, ordered_at: new Date(row.ordered_at) })) };
        if (text.includes('shipping_label_purchases')) return { rows: (db.labeled ?? []).map((id) => ({ id })) };
        throw new Error(`unexpected query: ${text}`);
      },
    } as never,
  };
}

const candidate = (orderId: number, orderedAt: string, labeled: boolean): BuyerOrderCandidate => ({ orderId, orderIds: [orderId], accountSource: 'eBay', orderRef: `E-${orderId}`, buyerName: 'Jane Doe', orderedAt, labeled });

test('buyer rule: no open order → BUYER_NOT_FOUND; exactly one → that order', () => {
  assert.deepEqual(pickBuyerOrder([]), { reason: 'BUYER_NOT_FOUND' });
  const only = candidate(5, '2026-10-01T00:00:00.000Z', true);
  assert.deepEqual(pickBuyerOrder([only]), { order: only, matchMethod: 'BUYER_NAME' });
});

test('buyer rule: several orders, none labeled yet → confirmation exception', () => {
  assert.deepEqual(pickBuyerOrder([candidate(1, '2026-10-01T00:00:00.000Z', false), candidate(2, '2026-10-02T00:00:00.000Z', false)]), { reason: 'BUYER_AMBIGUOUS' });
});

test('buyer rule: some already labeled → the MOST RECENT unlabeled order, not the newest order overall', () => {
  const pick = pickBuyerOrder([
    candidate(1, '2026-09-28T00:00:00.000Z', false),
    candidate(2, '2026-10-01T00:00:00.000Z', false),
    candidate(3, '2026-10-02T00:00:00.000Z', true),
  ]);
  assert.ok('order' in pick);
  assert.equal(pick.order.orderId, 2);
  assert.equal(pick.matchMethod, 'BUYER_NAME_NEXT_UNLABELED');
});

test('buyer rule: every order already labeled → confirmation exception (a second box is the operator\'s call)', () => {
  assert.deepEqual(pickBuyerOrder([candidate(1, '2026-10-01T00:00:00.000Z', true), candidate(2, '2026-10-02T00:00:00.000Z', true)]), { reason: 'BUYER_AMBIGUOUS' });
});

test('buyer names fold case, accents and punctuation', () => {
  assert.equal(normalizeBuyerName('Manuel de Jesús  Ramos'), normalizeBuyerName('MANUEL DE JESUS RAMOS'));
  assert.equal(normalizeBuyerName('Katharine K. Doran'), 'KATHARINE K DORAN');
});

test('an explicit order reference with its account wins before tracking or name', async () => {
  const sql: string[] = [];
  const result = await resolveExactLabelOrder({ query: async (text: string) => { sql.push(text); return { rows: [{ id: 9 }, { id: 10 }] }; } } as never, org, { ...evidence, marketplaceOrderId: 'ORDER-42', accountSource: 'ebay' });
  assert.deepEqual(result.orderIds, [9, 10]);
  assert.equal(result.exactOrder?.matchMethod, 'MARKETPLACE_ORDER_ID');
  assert.equal(sql.length, 1);
});

test('tracking already on one logical order pairs there without reading the buyer', async () => {
  const { client, sql } = fakeClient({ tracked: [{ id: 41, account_source: 'Amazon', order_id: '113-1' }, { id: 42, account_source: 'Amazon', order_id: '113-1' }] });
  const result = await resolveExactLabelOrder(client, org, evidence);
  assert.equal(result.exactOrder?.matchMethod, 'TRACKING_NUMBER');
  assert.deepEqual(result.orderIds, [41, 42]);
  assert.equal(sql.some((text) => text.includes('WITH named')), false);
});

test('a buyer\'s multi-product order is ONE order: its rows pair together by name', async () => {
  const { client } = fakeClient({
    buyers: [
      { id: 7, account_source: 'eBay', order_id: '02-1', ordered_at: '2026-10-01T00:00:00Z', buyer: 'Katharine K. Doran' },
      { id: 8, account_source: 'eBay', order_id: '02-1', ordered_at: '2026-10-01T00:00:00Z', buyer: 'Katharine Doran' },
      { id: 9, account_source: 'eBay', order_id: '02-9', ordered_at: '2026-10-01T00:00:00Z', buyer: 'Kathy Doran' },
    ],
  });
  const result = await resolveExactLabelOrder(client, org, evidence);
  assert.equal(result.exactOrder?.matchMethod, 'BUYER_NAME');
  assert.equal(result.exactOrder?.marketplaceOrderId, '02-1');
  assert.deepEqual(result.orderIds, [7, 8]);
});

test('two open orders for the buyer, one labeled → the label goes to the other', async () => {
  const { client } = fakeClient({
    buyers: [
      { id: 7, account_source: 'eBay', order_id: '02-1', ordered_at: '2026-10-01T00:00:00Z', buyer: 'KATHARINE K. DORAN' },
      { id: 9, account_source: 'Amazon', order_id: '113-9', ordered_at: '2026-10-02T00:00:00Z', buyer: 'KATHARINE K. DORAN' },
    ],
    labeled: [9],
  });
  const result = await resolveExactLabelOrder(client, org, evidence, 55);
  assert.equal(result.exactOrder?.matchMethod, 'BUYER_NAME_NEXT_UNLABELED');
  assert.deepEqual(result.orderIds, [7]);
});

test('no tracking read → quarantined before any order read', async () => {
  const result = await resolveExactLabelOrder({ query: async () => { throw new Error('must not query'); } } as never, org, { ...evidence, trackingNumberNormalized: null });
  assert.equal(result.quarantineReason, 'TRACKING_ONLY');
});

test('multi-package evidence quarantines before querying orders', async () => {
  const result = await resolveExactLabelOrder({ query: async () => { throw new Error('must not query'); } } as never, org, { ...evidence, multiPackageEvidence: true });
  assert.equal(result.quarantineReason, 'MULTI_PACKAGE_EVIDENCE');
});
