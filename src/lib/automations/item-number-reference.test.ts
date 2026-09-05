/**
 * DB-free tests for the pasted-handle → item number funnel. A scripted query
 * fake answers by statement shape; asserts resolution order, org threading,
 * and the ambiguous / not_found contract the assistant tool relays.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveItemNumberReference, type ItemReferenceQuery } from './item-number-reference';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;

function fakeQuery(script: (text: string, params: ReadonlyArray<unknown>) => Array<Record<string, unknown>>) {
  const calls: Array<{ orgId: string; text: string; params: ReadonlyArray<unknown> }> = [];
  const query: ItemReferenceQuery = async (orgId, text, params = []) => {
    calls.push({ orgId, text, params });
    return { rows: script(text, params) };
  };
  return { query, calls };
}

const isCount = (t: string) => t.includes('count(*)::int AS order_count') && t.includes('max(o.product_title) AS title') && !t.includes('GROUP BY');
const isOrder = (t: string) => t.includes('regexp_replace(COALESCE(o.order_id') && !t.includes('shipping_tracking_numbers');
const isTracking = (t: string) => t.includes('shipping_tracking_numbers');
const isPlatform = (t: string) => t.includes('sku_platform_ids');
const isTitle = (t: string) => t.includes('GROUP BY 1');

test('a bare item number resolves directly and reports the order count', async () => {
  const { query, calls } = fakeQuery((t) => (isCount(t) ? [{ order_count: 2, title: 'Bose Wave III' }] : []));
  const out = await resolveItemNumberReference(query, ORG, 'b07zy7-dwt6');
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.match.itemNumber, 'B07ZY7DWT6');
  assert.equal(out.match.matchedBy, 'item_number');
  assert.equal(out.match.orderCount, 2);
  assert.equal(calls.length, 1, 'first hit wins — no further lookups');
  for (const c of calls) {
    assert.equal(c.orgId, ORG);
    assert.equal(c.params[0], ORG);
  }
});

test('a marketplace order number resolves to that order\'s item number', async () => {
  const { query } = fakeQuery((t) => {
    if (isCount(t)) return [{ order_count: 3, title: null }];
    if (isOrder(t)) return [{ id: 13599, order_id: '114-3817423-8633022', item_number: 'B07ZY7DWT6', product_title: 'Bose Wave III' }];
    return [];
  });
  // The count for the raw handle itself must miss, then the order lookup hits.
  let countCalls = 0;
  const gated: ItemReferenceQuery = async (orgId, text, params) => {
    if (isCount(text)) {
      countCalls += 1;
      return { rows: countCalls === 1 ? [{ order_count: 0, title: null }] : [{ order_count: 3, title: 'Bose Wave III' }] };
    }
    return query(orgId, text, params);
  };
  const out = await resolveItemNumberReference(gated, ORG, '114-3817423-8633022');
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.match.matchedBy, 'order_number');
  assert.equal(out.match.itemNumber, 'B07ZY7DWT6');
  assert.equal(out.match.orderId, 13599);
  assert.equal(out.match.orderNumber, '114-3817423-8633022');
  assert.equal(out.match.orderCount, 3);
});

test('a tracking number walks orders.shipment_id to the item number', async () => {
  let countCalls = 0;
  const { query } = fakeQuery((t) => {
    if (isCount(t)) {
      countCalls += 1;
      return countCalls === 1 ? [{ order_count: 0, title: null }] : [{ order_count: 1, title: 'Bose TV Speaker' }];
    }
    if (isTracking(t)) return [{ id: 77, order_id: '111-1', item_number: 'B098YLPSY6', product_title: 'Bose TV Speaker' }];
    return [];
  });
  const out = await resolveItemNumberReference(query, ORG, '1Z999AA10123456784');
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.match.matchedBy, 'tracking_number');
  assert.equal(out.match.itemNumber, 'B098YLPSY6');
  assert.equal(out.match.orderId, 77);
});

test('a listing id with no orders yet resolves from the catalog pairing', async () => {
  const { query } = fakeQuery((t) => {
    if (isCount(t)) return [{ order_count: 0, title: null }];
    if (isPlatform(t)) return [{ platform_item_id: 'B0NEWITEM1', listing_title: 'New listing' }];
    return [];
  });
  const out = await resolveItemNumberReference(query, ORG, 'B0NEWITEM1');
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.match.matchedBy, 'platform_item_id');
  assert.equal(out.match.orderCount, 0);
  assert.equal(out.match.title, 'New listing');
});

test('a title that maps to one item number is a match; several is ambiguous with candidates', async () => {
  const one = fakeQuery((t) => (isTitle(t) ? [{ item_number: 'B07ZY7DWT6', title: 'Bose Wave Music System III', order_count: 2 }] : []));
  const a = await resolveItemNumberReference(one.query, ORG, 'Bose Wave Music System III');
  assert.equal(a.ok, true);
  if (a.ok) {
    assert.equal(a.match.matchedBy, 'title');
    assert.equal(a.match.itemNumber, 'B07ZY7DWT6');
  }
  // Spaced text never tries the bare-handle lookups.
  assert.ok(one.calls.every((c) => isTitle(c.text)));
  assert.equal(one.calls[0].params[1], 'Bose Wave Music System III');

  const many = fakeQuery((t) =>
    isTitle(t)
      ? [
          { item_number: 'B07ZY7DWT6', title: 'Bose Wave Music System III Certified', order_count: 2 },
          { item_number: 'B07ZY7GZRM', title: 'Bose Wave Music System III (Renewed)', order_count: 1 },
        ]
      : [],
  );
  const b = await resolveItemNumberReference(many.query, ORG, 'Bose Wave');
  assert.equal(b.ok, false);
  if (!b.ok) {
    assert.equal(b.reason, 'ambiguous');
    assert.deepEqual(b.candidates.map((c) => c.itemNumber), ['B07ZY7DWT6', 'B07ZY7GZRM']);
  }
});

test('nothing matching is not_found; blank input is empty and runs no query', async () => {
  const { query, calls } = fakeQuery(() => []);
  const a = await resolveItemNumberReference(query, ORG, 'ZZZ-does-not-exist');
  assert.deepEqual(a, { ok: false, reason: 'not_found', candidates: [] });
  assert.ok(calls.length >= 4, 'every bare-handle lookup was tried before giving up');

  calls.length = 0;
  const b = await resolveItemNumberReference(query, ORG, '   ');
  assert.deepEqual(b, { ok: false, reason: 'empty', candidates: [] });
  assert.equal(calls.length, 0);
});
