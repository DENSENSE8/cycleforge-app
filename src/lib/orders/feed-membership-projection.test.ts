import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planOrderUnshippedMembership,
  projectOrdersUnshippedMemberships,
  upsertOrderUnshippedMembership,
  type FeedProjectionDeps,
} from './feed-membership-projection';

/** Fake Deps: call 1 = fetch (canned rows), call 2 = upsert, call 3 = flip. */
function fakeDeps(fetchRows: unknown[], flipCount = 0): { deps: FeedProjectionDeps; calls: () => number } {
  let n = 0;
  const deps: FeedProjectionDeps = {
    execute: async () => {
      n += 1;
      if (n === 1) return { rows: fetchRows };
      if (n === 2) return { rows: [] }; // upsert (result ignored; upserted = memberships.length)
      return { rows: Array.from({ length: flipCount }, (_, i) => ({ id: i })) }; // flip
    },
  };
  return { deps, calls: () => n };
}

const row = (id: number, hasPickScan: boolean, isOutOfStock: boolean) => ({
  id,
  organization_id: 'org-1',
  shipment_id: 100 + id,
  has_pick_scan: hasPickScan,
  is_out_of_stock: isOutOfStock,
  occurred_at: new Date('2026-01-0' + ((id % 9) + 1)),
  title: `Order ${id}`,
});

test('computes the fulfillment lane in NODE (deriveFulfillmentState) and buckets by lane', async () => {
  const fetchRows = [
    row(1, false, false),   // PENDING (untested, in stock)
    row(2, true, false),    // TESTED
    row(3, true, true),     // BLOCKED — is_out_of_stock wins over pick scan
    row(4, false, false),   // PENDING — not out of stock
    row(5, false, true),    // BLOCKED — out of stock
  ];
  const { deps } = fakeDeps(fetchRows, 2);
  const res = await projectOrdersUnshippedMemberships(90, deps);

  assert.equal(res.success, true);
  assert.equal(res.upserted, 5);
  assert.deepEqual(res.byLane, { pending: 2, tested: 1, blocked: 2 });
  assert.equal(res.doneFlipped, 2);
});

test('empty queue: skips the upsert chunk, still runs the fetch + done-flip', async () => {
  const { deps, calls } = fakeDeps([], 0);
  const res = await projectOrdersUnshippedMemberships(90, deps);
  assert.equal(res.upserted, 0);
  assert.deepEqual(res.byLane, { pending: 0, tested: 0, blocked: 0 });
  assert.equal(calls(), 2, 'fetch + flip only — no upsert call when there is nothing to upsert');
});

test('windowDays clamps to [1, 365] (NaN → 90 default)', async () => {
  const mk = (): FeedProjectionDeps => ({ execute: async () => ({ rows: [] }) });
  assert.equal((await projectOrdersUnshippedMemberships(9999, mk())).windowDays, 365);
  assert.equal((await projectOrdersUnshippedMemberships(0, mk())).windowDays, 1);
  assert.equal((await projectOrdersUnshippedMemberships(Number.NaN, mk())).windowDays, 90);
});

test('planOrderUnshippedMembership: no label → skip (awaiting-label is not pending)', () => {
  const plan = planOrderUnshippedMembership({
    orgId: 'org-1',
    orderPk: 9,
    shipmentId: null,
    title: 'Manual add',
  });
  assert.equal(plan.skip, true);
  assert.equal(plan.state, null);
});

test('planOrderUnshippedMembership: labeled untested in-stock → pending', () => {
  const plan = planOrderUnshippedMembership({
    orgId: 'org-1',
    orderPk: 9,
    shipmentId: 44,
    title: 'Manual add',
  });
  assert.equal(plan.skip, false);
  if (plan.skip) return;
  assert.equal(plan.state, 'pending');
  assert.equal(plan.tone, 'default');
  assert.equal(plan.title, 'Manual add');
});

test('upsertOrderUnshippedMembership writes the orders_unshipped pending row', async () => {
  const captured: { text: string; params: unknown[] }[] = [];
  const client = {
    query: async (text: string, params?: unknown[]) => {
      captured.push({ text, params: params ?? [] });
      return { rows: [] };
    },
  };
  const res = await upsertOrderUnshippedMembership(client, {
    orgId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    orderPk: 42,
    shipmentId: 7,
    title: 'Test intake unit',
    occurredAt: new Date('2026-08-26T19:00:00Z'),
  });
  assert.equal(res.upserted, true);
  assert.equal(res.state, 'pending');
  assert.equal(captured.length, 1);
  assert.match(captured[0].text, /INSERT INTO feed_memberships/);
  assert.equal(captured[0].params[0], 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(captured[0].params[1], 42);
  assert.equal(captured[0].params[2], 'pending');
  assert.equal(captured[0].params[4], 'Test intake unit');
  assert.equal(captured[0].params[5], 'default');
});

test('upsertOrderUnshippedMembership skips when there is no shipment', async () => {
  let called = 0;
  const client = {
    query: async () => {
      called += 1;
      return { rows: [] };
    },
  };
  const res = await upsertOrderUnshippedMembership(client, {
    orgId: 'org-1',
    orderPk: 1,
    shipmentId: null,
    title: 'No label yet',
  });
  assert.equal(res.upserted, false);
  assert.equal(called, 0);
});
