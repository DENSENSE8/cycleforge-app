/**
 * DB-free branch coverage for the unit-pack-placement domain SoT (Phase 2).
 *
 * Mirrors the order-placement domain test: `placeUnitAtLocation` takes an
 * optional `client`, so we drive it with a fake `PoolClient` that dispatches on
 * SQL text (unit-exists gate → location resolve → same-location reject → upsert
 * + event) without a database.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import {
  clearUnitPackPlacement,
  placeUnitAtLocation,
  UnitPackPlacementError,
} from './unit-pack-placement';

const ORG = '00000000-0000-0000-0000-0000000000bb';

interface FakeRows {
  /** Row for `assertUnitExists` (`SELECT id FROM serial_units …`). */
  unitExists?: unknown[];
  /** Row for the placeable-location resolve (`FROM locations … ANY`). */
  location?: unknown[];
  /** Row for the current placement (`SELECT location_id FROM unit_pack_placements`). */
  existing?: unknown[];
}

function fakeClient(rows: FakeRows) {
  const log: string[] = [];
  const client = {
    query: async (sql: string) => {
      const text = String(sql);
      log.push(text.replace(/\s+/g, ' ').trim().slice(0, 48));
      if (/INSERT INTO unit_pack_placement_events/i.test(text)) return { rows: [] };
      if (/INSERT INTO unit_pack_placements/i.test(text)) return { rows: [] };
      if (/DELETE FROM unit_pack_placements/i.test(text)) return { rows: [] };
      if (/SELECT location_id\s+FROM unit_pack_placements/i.test(text)) {
        return { rows: rows.existing ?? [] };
      }
      if (/FROM locations/i.test(text) && /location_kind = ANY/i.test(text)) {
        return { rows: rows.location ?? [] };
      }
      if (/SELECT id FROM serial_units WHERE organization_id/i.test(text)) {
        return { rows: rows.unitExists ?? [] };
      }
      throw new Error(`unexpected SQL in fake client: ${text.slice(0, 60)}`);
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

test('placeUnitAtLocation rejects a non-positive unit id before any query', async () => {
  const { client, log } = fakeClient({});
  await assert.rejects(
    () =>
      placeUnitAtLocation(
        ORG as never,
        { unitId: 0, locationId: 5, staffId: 1, source: 'tech_scan' },
        client,
      ),
    (err: unknown) =>
      err instanceof UnitPackPlacementError && err.code === 'UNIT_NOT_FOUND',
  );
  assert.equal(log.length, 0, 'must reject before touching the DB');
});

test('placeUnitAtLocation → UNIT_NOT_FOUND when the unit row does not exist', async () => {
  const { client } = fakeClient({ unitExists: [] });
  await assert.rejects(
    () =>
      placeUnitAtLocation(
        ORG as never,
        { unitId: 42, locationId: 5, staffId: 1, source: 'tech_scan' },
        client,
      ),
    (err: unknown) =>
      err instanceof UnitPackPlacementError && err.code === 'UNIT_NOT_FOUND',
  );
});

test('placeUnitAtLocation → LOCATION_NOT_PLACEABLE when the bench is not a DESK/STAGING', async () => {
  const { client } = fakeClient({ unitExists: [{ id: 42 }], location: [] });
  await assert.rejects(
    () =>
      placeUnitAtLocation(
        ORG as never,
        { unitId: 42, barcode: 'NOT-A-BENCH', staffId: 1, source: 'tech_scan' },
        client,
      ),
    (err: unknown) =>
      err instanceof UnitPackPlacementError && err.code === 'LOCATION_NOT_PLACEABLE',
  );
});

test('placeUnitAtLocation → SAME_LOCATION on a move that would not change the bench', async () => {
  const { client } = fakeClient({
    unitExists: [{ id: 42 }],
    location: [DESK5],
    existing: [{ location_id: 5 }],
  });
  await assert.rejects(
    () =>
      placeUnitAtLocation(
        ORG as never,
        { unitId: 42, locationId: 5, staffId: 1, source: 'move' },
        client,
      ),
    (err: unknown) =>
      err instanceof UnitPackPlacementError && err.code === 'SAME_LOCATION',
  );
});

test('placeUnitAtLocation places a loose unit and returns the resolved bench', async () => {
  const { client, log } = fakeClient({
    unitExists: [{ id: 42 }],
    location: [DESK5],
    existing: [],
  });
  const placement = await placeUnitAtLocation(
    ORG as never,
    { unitId: 42, locationId: 5, staffId: 7, source: 'tech_scan' },
    client,
  );
  assert.equal(placement.unitId, 42);
  assert.equal(placement.locationId, 5);
  assert.equal(placement.locationName, 'Pack Desk 1');
  assert.equal(placement.locationKind, 'DESK');
  assert.equal(placement.source, 'tech_scan');
  assert.ok(log.some((t) => /INSERT INTO unit_pack_placements/i.test(t)));
  assert.ok(log.some((t) => /INSERT INTO unit_pack_placement_events/i.test(t)));
});

test('placeUnitAtLocation re-placing the same unit at the same bench via tech_scan is allowed', async () => {
  const { client } = fakeClient({
    unitExists: [{ id: 42 }],
    location: [DESK5],
    existing: [{ location_id: 5 }],
  });
  const placement = await placeUnitAtLocation(
    ORG as never,
    { unitId: 42, locationId: 5, staffId: 7, source: 'tech_scan' },
    client,
  );
  assert.equal(placement.locationId, 5);
});

test('clearUnitPackPlacement returns false for a non-positive unit id (no query)', async () => {
  const { client, log } = fakeClient({});
  const cleared = await clearUnitPackPlacement(
    ORG as never,
    { unitId: 0, staffId: 1 },
    client,
  );
  assert.equal(cleared, false);
  assert.equal(log.length, 0, 'must reject before touching the DB');
});

test('clearUnitPackPlacement returns false when the unit has no placement', async () => {
  const { client } = fakeClient({ existing: [] });
  const cleared = await clearUnitPackPlacement(
    ORG as never,
    { unitId: 42, staffId: 1 },
    client,
  );
  assert.equal(cleared, false);
});

test('clearUnitPackPlacement deletes + audits when a placement exists', async () => {
  const { client, log } = fakeClient({ existing: [{ location_id: 5 }] });
  const cleared = await clearUnitPackPlacement(
    ORG as never,
    { unitId: 42, staffId: 1, reason: 'pack_complete' },
    client,
  );
  assert.equal(cleared, true);
  assert.ok(log.some((t) => /DELETE FROM unit_pack_placements/i.test(t)));
  assert.ok(log.some((t) => /INSERT INTO unit_pack_placement_events/i.test(t)));
});
