import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import { groupOrderLines, type OrderLineFactRow } from './order-facts';
import type { OrderPlatformResolver } from './order-platform';
import {
  classifyOrderReference,
  resolveOrderReference,
  type ResolveOrderReferenceDeps,
} from './resolve-order-reference';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const platformOf: OrderPlatformResolver = (_n, source) => ({
  slug: String(source ?? '').toLowerCase() || null,
  accountLabel: null,
  platformAccountId: null,
});

function line(id: number, orderNumber: string | null, accountSource: string, extra: Partial<OrderLineFactRow> = {}): OrderLineFactRow {
  return {
    line_id: id,
    group_key: orderNumber ? `order:${accountSource}\x1f${orderNumber}` : `line:${id}`,
    order_number: orderNumber,
    account_source: accountSource,
    status: 'shipped',
    fulfillment_channel: null,
    quantity: '1',
    sku: `SKU-${id}`,
    admin_url: null,
    catalog_product_title: `Catalog ${id}`,
    zoho_item_title: null,
    item_name: `Listing ${id}`,
    customer_name: 'Ada Buyer',
    customer_email: 'ada@example.com',
    customer_phone: null,
    line_ship_confirm_at: null,
    shipments: [],
    ...extra,
  };
}

/** Fake lookups over a fixed line table; captures what was asked. */
function fakes(table: OrderLineFactRow[], numberHits: { exact: number[]; loose: number[] }, trackingHits: number[] = [], itemHits: number[] = []) {
  const calls: string[] = [];
  const deps: ResolveOrderReferenceDeps = {
    matchOrderPk: async (_org, id) => {
      calls.push(`pk:${id}`);
      return table.some((l) => l.line_id === id) ? [id] : [];
    },
    matchOrderNumber: async (org, text) => {
      assert.equal(org, ORG);
      calls.push(`number:${text}`);
      return numberHits;
    },
    matchTracking: async (_org, text) => {
      calls.push(`tracking:${text}`);
      return trackingHits;
    },
    matchItemNumber: async (_org, item) => {
      calls.push(`item:${item}`);
      return itemHits;
    },
    // Like ORDER_GROUP_LINES_SQL: every line of each matched order, then fold.
    loadGroups: async (_org, ids) => {
      const keys = new Set(table.filter((l) => ids.includes(l.line_id)).map((l) => l.group_key));
      return groupOrderLines(table.filter((l) => keys.has(l.group_key)), platformOf);
    },
  };
  return { deps, calls };
}

test('classify: order pk, listing URL, marketplace id, tracking token, prose', () => {
  assert.deepEqual(classifyOrderReference('orders:123'), { kind: 'order_pk', orderId: 123 });
  assert.deepEqual(classifyOrderReference('https://app.example/search?sel=order:77'), { kind: 'order_pk', orderId: 77 });
  assert.deepEqual(classifyOrderReference('https://www.ebay.com/itm/256789012345'), { kind: 'listing', itemNumber: '256789012345' });
  assert.deepEqual(classifyOrderReference('https://www.ebay.com/sch/i.html?_nkw=speaker'), { kind: 'unknown' });
  assert.deepEqual(classifyOrderReference(' 113-6729910-1909809 '), { kind: 'marketplace_id', orderNumber: '113-6729910-1909809' });
  assert.deepEqual(classifyOrderReference('03-15100-78272'), { kind: 'marketplace_id', orderNumber: '03-15100-78272' });
  const tracking = classifyOrderReference('9400 1000 0000 0000 0000 00');
  assert.equal(tracking.kind, 'token');
  assert.equal(tracking.kind === 'token' && tracking.trackingShaped, true);
  const ecwid = classifyOrderReference('#5103');
  assert.deepEqual(ecwid, { kind: 'token', text: '5103', trackingShaped: false });
  assert.deepEqual(classifyOrderReference('where is my order please'), { kind: 'unknown' });
  assert.deepEqual(classifyOrderReference('   '), { kind: 'unknown' });
});

test('representative id: a multi-line order folds into ONE candidate keyed by its lowest line id', async () => {
  const table = [line(905, '5103', 'ecwid'), line(901, '5103', 'ecwid'), line(903, '5103', 'ecwid')];
  const { deps } = fakes(table, { exact: [905], loose: [905] });
  const out = await resolveOrderReference(ORG, '5103', deps);
  assert.equal(out.kind, 'order_number');
  assert.equal(out.ambiguous, false);
  assert.equal(out.candidates.length, 1);
  assert.equal(out.candidates[0].orderId, 901, 'lowest line id of the order, not the matched line');
  assert.deepEqual(out.candidates[0].products.map((p) => p.orderLineId), [901, 903, 905]);
  assert.equal(out.candidates[0].externalReference, '5103');
  assert.equal(out.candidates[0].primary, false);
});

test('ambiguity refusal: two distinct orders → ambiguous, both offered, none picked', async () => {
  // Same number on two storefronts = two customer orders.
  const table = [line(10, '5103', 'ecwid'), line(11, '5103', 'shopify'), line(12, '5103', 'ecwid')];
  const { deps } = fakes(table, { exact: [10, 11, 12], loose: [10, 11, 12] });
  const out = await resolveOrderReference(ORG, '5103', deps);
  assert.equal(out.ambiguous, true);
  assert.deepEqual(out.candidates.map((c) => c.orderId).sort((a, b) => a - b), [10, 11]);
  assert.ok(out.candidates.every((c) => c.primary === false));
});

test('exact full-number match wins over loose last-8 matches; loose only when no exact hit', async () => {
  const table = [line(1, '22-15228-39486', 'eBay'), line(2, '99-15228-39486', 'eBay')];
  const exact = await resolveOrderReference(ORG, '22-15228-39486', fakes(table, { exact: [1], loose: [1, 2] }).deps);
  assert.equal(exact.kind, 'marketplace_id');
  assert.equal(exact.ambiguous, false);
  assert.deepEqual(exact.candidates.map((c) => c.orderId), [1]);

  const loose = await resolveOrderReference(ORG, '15228394', fakes(table, { exact: [], loose: [1, 2] }).deps);
  assert.equal(loose.ambiguous, true, 'a loose tail match naming two orders is refused, not picked');
});

test('tracking-shaped token: order number first, then tracking, then listing item number', async () => {
  const table = [line(40, 'A-40', 'eBay'), line(41, 'A-40', 'eBay')];
  const { deps, calls } = fakes(table, { exact: [], loose: [] }, [41]);
  const out = await resolveOrderReference(ORG, '9400100000000000000000', deps);
  assert.equal(out.kind, 'tracking');
  assert.deepEqual(out.candidates.map((c) => c.orderId), [40]);
  assert.deepEqual(calls, ['number:9400100000000000000000', 'tracking:9400100000000000000000']);

  const viaItem = fakes(table, { exact: [], loose: [] }, [], [40]);
  const item = await resolveOrderReference(ORG, '256789012345', viaItem.deps);
  assert.equal(item.kind, 'listing');
  assert.deepEqual(viaItem.calls, ['number:256789012345', 'tracking:256789012345', 'item:256789012345']);
});

test('nothing matched or unknown text → empty, never ambiguous, no group load', async () => {
  const { deps, calls } = fakes([], { exact: [], loose: [] });
  assert.deepEqual(await resolveOrderReference(ORG, 'hello there friend', deps), { kind: 'unknown', candidates: [], ambiguous: false });
  assert.deepEqual(calls, []);
  const none = await resolveOrderReference(ORG, '5103', deps);
  assert.deepEqual(none, { kind: 'order_number', candidates: [], ambiguous: false });
});
