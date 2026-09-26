import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import { resolveEntity } from './journey';

/** DB-free coverage for the `dim=unit` handoff branch of {@link resolveEntity} (search → Operations ▸ History Trace via `?dim=unit&unit={id}`). */

type Row = Record<string, unknown>;

function fakeClient(handlers: Array<{ match: RegExp; rows: Row[] }>) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const handler = handlers.find((h) => h.match.test(sql));
      return { rows: handler ? handler.rows : [] };
    },
  } as unknown as PoolClient;
  return { client, calls };
}

const ORG = 'org-test';

test('resolveEntity dim=unit: numeric id → serial anchors (no allocation)', async () => {
  const { client, calls } = fakeClient([
    { match: /FROM serial_units/i, rows: [{ id: 42, serial_number: 'SN-ABC' }] },
    { match: /order_unit_allocations/i, rows: [] },
  ]);

  const anchors = await resolveEntity(client, ORG, 'unit', '42');

  assert.ok(anchors, 'expected anchors');
  assert.equal(anchors.kind, 'serial'); // URL may say dim=unit; anchors behave as serial Trace
  assert.deepEqual(anchors.serialUnitIds, [42]);
  assert.deepEqual(anchors.serials, ['SN-ABC']);
  assert.equal(anchors.orderId, null);
  assert.deepEqual(anchors.trackingNumbers, []);
  // The unit branch keys off serial_units.id, not a serial string.
  const unitLookup = calls.find((c) => /FROM serial_units/i.test(c.sql));
  assert.ok(unitLookup);
  assert.deepEqual(unitLookup?.params, [ORG, 42]);
});

test('resolveEntity dim=unit: allocated + shipped → order + tracking anchors', async () => {
  const { client } = fakeClient([
    { match: /FROM serial_units/i, rows: [{ id: 42, serial_number: 'SN-ABC' }] },
    { match: /order_unit_allocations/i, rows: [{ id: 7, order_id: 'ORD-1', shipment_id: 99 }] },
    { match: /shipping_tracking_numbers/i, rows: [{ tracking_number_raw: '1Z999AA ' }] },
  ]);

  const anchors = await resolveEntity(client, ORG, 'unit', '42');

  assert.ok(anchors);
  assert.equal(anchors.orderId, 7);
  assert.equal(anchors.orderNumber, 'ORD-1');
  assert.equal(anchors.shipmentId, 99);
  assert.deepEqual(anchors.trackingNumbers, ['1Z999AA']); // trimmed
});

test('resolveEntity dim=unit: non-numeric value → null, no query', async () => {
  const { client, calls } = fakeClient([
    { match: /FROM serial_units/i, rows: [{ id: 1, serial_number: 'X' }] },
  ]);

  const anchors = await resolveEntity(client, ORG, 'unit', 'not-a-number');

  assert.equal(anchors, null);
  assert.equal(calls.length, 0, 'must not hit the DB for a non-numeric unit id');
});

test('resolveEntity dim=unit: unknown id → null', async () => {
  const { client } = fakeClient([{ match: /FROM serial_units/i, rows: [] }]);
  const anchors = await resolveEntity(client, ORG, 'unit', '999999');
  assert.equal(anchors, null);
});

test('resolveEntity: blank value → null for any dim', async () => {
  const { client, calls } = fakeClient([]);
  assert.equal(await resolveEntity(client, ORG, 'unit', '   '), null);
  assert.equal(await resolveEntity(client, ORG, 'serial', ''), null);
  assert.equal(calls.length, 0);
});
