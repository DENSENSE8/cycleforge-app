/** DB-free branch coverage for the pack-placement domain SoT. */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import {
  clearOrderPackPlacement,
  placeOrderAtLocation,
  PackPlacementError,
} from './pack-placement';

const ORG = '00000000-0000-0000-0000-0000000000aa';

interface FakeRows {
  /** Row for `assertOrderInPrepack`'s membership probe (`FROM orders o …`). */
  prepack?: unknown[];
  /** Row for the order-existence fallback (`SELECT id FROM orders WHERE …`). */
  orderExists?: unknown[];
  /** Row for the placeable-location resolve (`FROM locations … ANY`). */
  location?: unknown[];
  /** Row for the current placement (`SELECT location_id FROM order_pack_placements`). */
  existing?: unknown[];
}

/** A `PoolClient`-shaped stub that records every statement it runs. */
function fakeClient(rows: FakeRows) {
  const log: string[] = [];
  const client = {
    query: async (sql: string) => {
      const text = String(sql);
      const tag = text.replace(/\s+/g, ' ').trim().slice(0, 48);
      log.push(tag);
      if (/INSERT INTO order_pack_placement_events/i.test(text)) return { rows: [] };
      if (/INSERT INTO order_pack_placements/i.test(text)) return { rows: [] };
      if (/DELETE FROM order_pack_placements/i.test(text)) return { rows: [] };
      if (/SELECT location_id\s+FROM order_pack_placements/i.test(text)) {
        return { rows: rows.existing ?? [] };
      }
      if (/FROM locations/i.test(text) && /location_kind = ANY/i.test(text)) {
        return { rows: rows.location ?? [] };
      }
      if (/FROM orders o/i.test(text)) return { rows: rows.prepack ?? [] };
      if (/SELECT id FROM orders WHERE organization_id/i.test(text)) {
        return { rows: rows.orderExists ?? [] };
      }
      throw new Error(`unexpected SQL in fake client: ${tag}`);
    },
  } as unknown as PoolClient;
  return { client, log };
}

const DESK5 = {
  id: 5,
  name: 'Pack Desk 1',
  barcode: 'PACK-DESK-01',
  location_kind: 'DESK',
  room: 'Pack Floor',
  sort_order: 210,
};

test('placeOrderAtLocation rejects a non-positive order id before any query', async () => {
  const { client, log } = fakeClient({});
  await assert.rejects(
    () =>
      placeOrderAtLocation(
        ORG as never,
        { orderId: 0, locationId: 5, staffId: 1, source: 'tech_scan' },
        client,
      ),
    (err: unknown) =>
      err instanceof PackPlacementError && err.code === 'ORDER_NOT_FOUND',
  );
  assert.equal(log.length, 0, 'must reject before touching the DB');
});

test('placeOrderAtLocation → ORDER_NOT_PREPACK when the order exists but is off the board', async () => {
  const { client } = fakeClient({ prepack: [], orderExists: [{ id: 42 }] });
  await assert.rejects(
    () =>
      placeOrderAtLocation(
        ORG as never,
        { orderId: 42, locationId: 5, staffId: 1, source: 'tech_scan' },
        client,
      ),
    (err: unknown) =>
      err instanceof PackPlacementError && err.code === 'ORDER_NOT_PREPACK',
  );
});

test('placeOrderAtLocation → ORDER_NOT_FOUND when the order row does not exist', async () => {
  const { client } = fakeClient({ prepack: [], orderExists: [] });
  await assert.rejects(
    () =>
      placeOrderAtLocation(
        ORG as never,
        { orderId: 999, barcode: 'PACK-DESK-01', staffId: 1, source: 'tech_scan' },
        client,
      ),
    (err: unknown) =>
      err instanceof PackPlacementError && err.code === 'ORDER_NOT_FOUND',
  );
});

test('placeOrderAtLocation → LOCATION_NOT_PLACEABLE when the barcode is not a DESK/STAGING', async () => {
  const { client } = fakeClient({ prepack: [{ id: 42 }], location: [] });
  await assert.rejects(
    () =>
      placeOrderAtLocation(
        ORG as never,
        { orderId: 42, barcode: 'NOT-A-BENCH', staffId: 1, source: 'tech_scan' },
        client,
      ),
    (err: unknown) =>
      err instanceof PackPlacementError && err.code === 'LOCATION_NOT_PLACEABLE',
  );
});

test('placeOrderAtLocation → SAME_LOCATION on a move that would not change the bench', async () => {
  const { client } = fakeClient({
    prepack: [{ id: 42 }],
    location: [DESK5],
    existing: [{ location_id: 5 }],
  });
  await assert.rejects(
    () =>
      placeOrderAtLocation(
        ORG as never,
        { orderId: 42, locationId: 5, staffId: 1, source: 'move' },
        client,
      ),
    (err: unknown) =>
      err instanceof PackPlacementError && err.code === 'SAME_LOCATION',
  );
});

test('placeOrderAtLocation places a prepack order and returns the resolved bench', async () => {
  const { client, log } = fakeClient({
    prepack: [{ id: 42 }],
    location: [DESK5],
    existing: [],
  });
  const placement = await placeOrderAtLocation(
    ORG as never,
    { orderId: 42, locationId: 5, staffId: 7, source: 'tech_scan' },
    client,
  );
  assert.equal(placement.orderId, 42);
  assert.equal(placement.locationId, 5);
  assert.equal(placement.locationName, 'Pack Desk 1');
  assert.equal(placement.locationKind, 'DESK');
  assert.equal(placement.source, 'tech_scan');
  assert.equal(placement.placedByStaffId, 7);
  assert.ok(
    log.some((t) => /INSERT INTO order_pack_placements/i.test(t)),
    'writes the current-placement upsert',
  );
  assert.ok(
    log.some((t) => /INSERT INTO order_pack_placement_events/i.test(t)),
    'writes the append-only move/place event',
  );
});

test('placeOrderAtLocation re-placing at the SAME bench via tech_scan is allowed (not a move)', async () => {
  // A re-scan of the same carton to the same armed bench must be idempotent, not
  // a SAME_LOCATION error — that guard is scoped to explicit `move` intents.
  const { client } = fakeClient({
    prepack: [{ id: 42 }],
    location: [DESK5],
    existing: [{ location_id: 5 }],
  });
  const placement = await placeOrderAtLocation(
    ORG as never,
    { orderId: 42, locationId: 5, staffId: 7, source: 'tech_scan' },
    client,
  );
  assert.equal(placement.locationId, 5);
});

test('clearOrderPackPlacement returns false for a non-positive order id (no query)', async () => {
  const { client, log } = fakeClient({});
  const cleared = await clearOrderPackPlacement(
    ORG as never,
    { orderId: 0, staffId: 1 },
    client,
  );
  assert.equal(cleared, false);
  assert.equal(log.length, 0);
});

test('clearOrderPackPlacement returns false when the order has no placement', async () => {
  const { client } = fakeClient({ existing: [] });
  const cleared = await clearOrderPackPlacement(
    ORG as never,
    { orderId: 42, staffId: 1 },
    client,
  );
  assert.equal(cleared, false);
});

test('clearOrderPackPlacement deletes + audits when a placement exists', async () => {
  const { client, log } = fakeClient({ existing: [{ location_id: 5 }] });
  const cleared = await clearOrderPackPlacement(
    ORG as never,
    { orderId: 42, staffId: 1, reason: 'pack_complete' },
    client,
  );
  assert.equal(cleared, true);
  assert.ok(log.some((t) => /DELETE FROM order_pack_placements/i.test(t)));
  assert.ok(log.some((t) => /INSERT INTO order_pack_placement_events/i.test(t)));
});
