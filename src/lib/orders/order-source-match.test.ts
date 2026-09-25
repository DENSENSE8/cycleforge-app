import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crossSourceBackfillPolicy,
  matchAggregatorOrderRows,
  matchMarketplaceOrderRows,
  orderCollapseCandidates,
  shouldRekeyToIncomingSource,
  type PlatformOf,
} from './order-source-match';
import { planOrderRowBackfill } from './order-row-backfill';
import type { BackfillIncoming, BackfillRow } from './order-row-backfill';

/**
 * DB-free: which existing rows a ShipStation (aggregator) or marketplace order
 * resolves to across account sources, and what the writer then writes.
 * Run: node --require ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/orders/order-source-match.test.ts
 */

const row = (id: number, accountSource: string | null) => ({ id, accountSource });

/** A catalog that knows eBay's accounts and the usual platform spellings. */
const platformOf: PlatformOf = (source) => {
  const s = (source ?? '').trim().toLowerCase();
  if (['ebay', 'mekong', 'dragon', 'usav'].includes(s)) return 'ebay';
  if (s === 'ecwid') return 'ecwid';
  if (s === 'amazon') return 'amazon';
  return null;
};

test('aggregator: the row under the exact platform source is the match (same)', () => {
  const m = matchAggregatorOrderRows('Amazon', [row(1, 'eBay'), row(2, 'Amazon')], platformOf);
  assert.equal(m.kind, 'same', 'an exact source row wins even beside another platform');
  assert.deepEqual(m.rows.map((r) => r.id), [2]);
});

test('aggregator: another spelling or grain of the SAME platform is adopted, all rows', () => {
  const spelling = matchAggregatorOrderRows('ecwid', [row(1, 'ECWID'), row(2, 'Ecwid')], platformOf);
  assert.equal(spelling.kind, 'adopt');
  assert.deepEqual(spelling.rows.map((r) => r.id), [1, 2]);
  const grain = matchAggregatorOrderRows('eBay', [row(3, 'MEKONG')], platformOf);
  assert.equal(grain.kind, 'adopt', 'an eBay account name is the eBay platform');
});

test('aggregator: a single other platform (or a blank source) is adopted, never re-sourced', () => {
  assert.equal(matchAggregatorOrderRows('shopify', [row(1, 'Other')], platformOf).kind, 'adopt');
  const withBlank = matchAggregatorOrderRows('ecwid', [row(1, 'ECWID'), row(2, null)], platformOf);
  assert.equal(withBlank.kind, 'adopt', 'a blank source names no platform, so it adds no ambiguity');
});

test('aggregator: rows under two platforms, or a legacy row beside a marketplace row, are ambiguous', () => {
  assert.equal(matchAggregatorOrderRows('ecwid', [row(1, 'Amazon'), row(2, 'eBay')], platformOf).kind, 'ambiguous');
  assert.equal(matchAggregatorOrderRows('ecwid', [row(1, 'shipstation'), row(2, 'ECWID')], platformOf).kind, 'ambiguous');
  assert.equal(
    matchAggregatorOrderRows('ecwid', [row(1, 'QA-DEMO'), row(2, 'Walmart')], platformOf).kind,
    'ambiguous',
    'unplaced sources still differ by their own text',
  );
});

test('aggregator: only legacy shipstation rows → claimed; nothing → none (insert)', () => {
  const claim = matchAggregatorOrderRows('ecwid', [row(7, 'ShipStation ')], platformOf);
  assert.equal(claim.kind, 'claim', 'legacy detection is trimmed + case-insensitive');
  assert.deepEqual(claim.rows.map((r) => r.id), [7]);
  assert.deepEqual(matchAggregatorOrderRows('ecwid', [], platformOf), { kind: 'none', rows: [] });
});

test('marketplace lane: claims a legacy shipstation row; another marketplace\'s row is never claimed', () => {
  const claim = matchMarketplaceOrderRows('shopify', [row(7, 'shipstation')]);
  assert.equal(claim.kind, 'claim');
  assert.equal(matchMarketplaceOrderRows('shopify', [row(8, 'square')]).kind, 'none');
  assert.equal(matchMarketplaceOrderRows('', [row(9, 'shipstation')]).kind, 'none', 'a blank source claims nothing');
});

test('re-key only moves an aggregator row to a named marketplace', () => {
  assert.equal(shouldRekeyToIncomingSource('shipstation', 'ecwid'), true);
  assert.equal(shouldRekeyToIncomingSource('ecwid', 'shipstation'), false);
  assert.equal(shouldRekeyToIncomingSource('ecwid', 'Amazon'), false);
  assert.equal(shouldRekeyToIncomingSource('shipstation', '  '), false);
});

test('collapse keeps the marketplace row even when the ShipStation copy is richer', () => {
  const rows = [
    { id: 1, accountSource: 'shipstation', filled: 6 },
    { id: 2, accountSource: 'ecwid', filled: 2 },
    { id: 3, accountSource: null, filled: 4 },
  ];
  const order = orderCollapseCandidates(rows, (r) => r.filled).map((r) => r.id);
  assert.deepEqual(order, [3, 2, 1], 'marketplace rows first by richness; the aggregator copy is always the one deleted');
});

const existing = (over: Partial<BackfillRow> = {}): BackfillRow => ({
  orderId: '111-222',
  itemNumber: 'B0ASIN',
  productTitle: 'Marketplace title',
  quantity: '1',
  sku: 'SKU-1',
  condition: 'New',
  notes: '',
  customerId: 55,
  shipmentId: 900,
  accountSource: 'Amazon',
  status: 'unassigned',
  saleAmount: '19.99',
  currency: 'USD',
  ...over,
});

const shipstationCopy = (over: Partial<BackfillIncoming> = {}): BackfillIncoming => ({
  orderId: '111-222',
  itemNumber: 'SS-ITEM',
  productTitle: 'ShipStation title',
  sku: 'SS-SKU',
  skuCatalogId: null,
  quantity: '2',
  condition: '',
  notes: 'gift',
  status: 'shipped',
  saleAmount: '25.00',
  currency: 'USD',
  accountSource: 'Amazon',
  customerId: 77,
  shipmentIds: [],
  ...over,
});

test('adopt writes status + blanks only: source, title, customer link, price, sku are the marketplace\'s', () => {
  const plan = planOrderRowBackfill(existing(), shipstationCopy(), {
    ...crossSourceBackfillPolicy('adopt', true),
    statusAuthoritative: true,
  });
  assert.deepEqual(plan.values, { status: 'shipped', notes: 'gift' });
});

test('adopt fills a blank account_source with the platform (missing association), never overwrites one', () => {
  const blank = planOrderRowBackfill(existing({ accountSource: '' }), shipstationCopy(), {
    ...crossSourceBackfillPolicy('adopt', true),
    statusAuthoritative: true,
  });
  assert.equal(blank.values.accountSource, 'Amazon');
  const set = planOrderRowBackfill(existing({ accountSource: 'MEKONG' }), shipstationCopy({ accountSource: 'eBay' }), {
    ...crossSourceBackfillPolicy('adopt', true),
    statusAuthoritative: true,
  });
  assert.equal('accountSource' in set.values, false);
});

test('claim re-keys the aggregator row and applies the marketplace\'s title authority', () => {
  const plan = planOrderRowBackfill(
    existing({ accountSource: 'shipstation', productTitle: 'ShipStation title' }),
    shipstationCopy({ accountSource: 'shopify', productTitle: 'Shopify title', status: null }),
    { ...crossSourceBackfillPolicy('claim', true), statusAuthoritative: true },
  );
  assert.equal(plan.values.accountSource, 'shopify');
  assert.equal(plan.values.productTitle, 'Shopify title');
});

test('an unchanged catalog link or status is not rewritten (a re-sync writes nothing)', () => {
  const plan = planOrderRowBackfill(
    existing({ itemNumber: '', skuCatalogId: 956, status: 'shipped' }),
    shipstationCopy({ skuCatalogId: 956, status: 'shipped', notes: '', saleAmount: null, accountSource: 'Amazon' }),
    { titleAuthoritative: false, statusAuthoritative: true, sourceWrite: 'fill' },
  );
  assert.equal('skuCatalogId' in plan.values, false);
  assert.equal('status' in plan.values, false);
});

test('same-source fill: a blank source is stamped, a set one is kept, an operator-moved status survives', () => {
  const blank = planOrderRowBackfill(existing({ accountSource: null }), shipstationCopy({ accountSource: 'Amazon' }), {
    titleAuthoritative: false,
    statusAuthoritative: true,
    sourceWrite: 'fill',
  });
  assert.equal(blank.values.accountSource, 'Amazon');

  const moved = planOrderRowBackfill(existing({ status: 'packed' }), shipstationCopy(), {
    titleAuthoritative: false,
    statusAuthoritative: true,
    sourceWrite: 'fill',
  });
  assert.equal('status' in moved.values, false);
  assert.equal('accountSource' in moved.values, false);
});
