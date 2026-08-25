/**
 * placements.test.ts — DB-free unit coverage for the unit↔location spine writer.
 *
 * House Deps pattern (domain-unit-test): a scripted PlacementQueryable stands in
 * for the tenant transaction, every collaborator call is captured, and the
 * assertions check BOTH the return value and what was threaded onward — the
 * org scoping, the D10 scan-law refusal, idempotent replays, and the
 * pointer-update/ops-event ordering are the invariants under test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import { NO_SESSION } from '@/lib/sessions/attribution';
import type { RecordOpsEventInput } from '@/lib/ops-events';
import {
  LocationScanLawError,
  SpineResolutionError,
  recordPartPull,
  recordUnitPlacement,
  type PlacementDeps,
  type PlacementQueryable,
} from './placements';

const ORG = '11111111-1111-1111-1111-111111111111' as OrgId;

interface CapturedQuery {
  sql: string;
  params: ReadonlyArray<unknown>;
}

interface Captured {
  queries: CapturedQuery[];
  opsEvents: RecordOpsEventInput[];
  transactionOrgs: OrgId[];
}

interface FakeOptions {
  /** rows for the serial_units resolve; [] = unit not found */
  unitRows?: unknown[];
  /** rows for the locations resolve; [] = location not found */
  locationRows?: unknown[];
  /** rows RETURNING id from the fact INSERT; [] = idempotent replay */
  insertRows?: unknown[];
}

function fakes(opts: FakeOptions = {}) {
  const cap: Captured = { queries: [], opsEvents: [], transactionOrgs: [] };
  const unitRows = opts.unitRows ?? [{ id: 42, location_id: 9 }];
  const locationRows = opts.locationRows ?? [{ id: 12 }];
  const insertRows = opts.insertRows ?? [{ id: 777 }];

  const db: PlacementQueryable = {
    query: async (sql, params = []) => {
      cap.queries.push({ sql, params });
      if (sql.includes('FROM serial_units')) return { rows: unitRows };
      if (sql.includes('FROM locations')) return { rows: locationRows };
      if (sql.includes('INSERT INTO unit_placements')) return { rows: insertRows };
      if (sql.includes('INSERT INTO part_pulls')) return { rows: insertRows };
      if (sql.startsWith('UPDATE serial_units')) return { rows: [], rowCount: 1 };
      throw new Error(`fake db has no script for: ${sql.slice(0, 60)}`);
    },
  };

  const deps: PlacementDeps = {
    withTenantTransaction: async (orgId, fn) => {
      cap.transactionOrgs.push(orgId);
      return fn(db);
    },
    recordOpsEvent: async (input) => {
      cap.opsEvents.push(input);
    },
    newClientEventId: () => 'minted-1',
  };
  return { deps, cap };
}

const basePlacement = {
  unitScan: { value: 'SN-ABC-123', source: 'scanner' } as const,
  locationScan: { value: 'RACK-B-03', source: 'camera' } as const,
  placedBy: 5,
  session: NO_SESSION,
  clientEventId: 'evt-1',
};

test('placement: fact + pointer land in one transaction, ops event after', async () => {
  const { deps, cap } = fakes();
  const out = await recordUnitPlacement(ORG, basePlacement, deps);

  assert.deepEqual(out, {
    placementId: 777,
    serialUnitId: 42,
    locationId: 12,
    previousLocationId: 9,
    alreadyRecorded: false,
  });
  assert.deepEqual(cap.transactionOrgs, [ORG]); // org from the argument, nowhere else

  const insert = cap.queries.find((q) => q.sql.includes('INSERT INTO unit_placements'));
  assert.ok(insert, 'placement INSERT fired');
  assert.equal(insert.params[0], ORG); // org leads the row
  assert.equal(insert.params[3], 9); // previous_location_id = the unit's old pointer
  assert.equal(insert.params[5], 'scanner'); // unit_scan_source
  assert.equal(insert.params[6], 'camera'); // location_scan_source
  assert.equal(insert.params[9], 'evt-1'); // caller's idempotency key wins

  const update = cap.queries.find((q) => q.sql.startsWith('UPDATE serial_units'));
  assert.ok(update, 'pointer update fired');
  assert.deepEqual(update.params, [42, 12]);

  assert.equal(cap.opsEvents.length, 1);
  const ev = cap.opsEvents[0];
  assert.equal(ev.organizationId, ORG);
  assert.equal(ev.entityType, 'serial_unit');
  assert.equal(ev.eventType, 'unit.placed');
  assert.equal(ev.actorStaffId, 5);
  assert.equal(ev.clientEventId, 'evt-1:ops');
});

test('placement: a typed location is refused by name, before any IO (D10)', async () => {
  const { deps, cap } = fakes();
  await assert.rejects(
    recordUnitPlacement(
      ORG,
      { ...basePlacement, locationScan: { value: 'RACK-B-03', source: 'human' } },
      deps,
    ),
    (err: unknown) => err instanceof LocationScanLawError && err.source === 'human',
  );
  assert.equal(cap.transactionOrgs.length, 0); // never even opened a transaction
  assert.equal(cap.opsEvents.length, 0);
});

test('placement: pasted location is refused too — only scanner/camera are lawful', async () => {
  const { deps } = fakes();
  await assert.rejects(
    recordUnitPlacement(
      ORG,
      { ...basePlacement, locationScan: { value: 'RACK-B-03', source: 'paste' } },
      deps,
    ),
    LocationScanLawError,
  );
});

test('placement: idempotent replay writes nothing and reports itself', async () => {
  const { deps, cap } = fakes({ insertRows: [] });
  const out = await recordUnitPlacement(ORG, basePlacement, deps);

  assert.equal(out.alreadyRecorded, true);
  assert.equal(out.placementId, null);
  assert.ok(
    !cap.queries.some((q) => q.sql.startsWith('UPDATE serial_units')),
    'replay must not touch the pointer',
  );
  assert.equal(cap.opsEvents.length, 0); // and must not double-report
});

test('placement: unknown unit maps to a typed 404, nothing written', async () => {
  const { deps, cap } = fakes({ unitRows: [] });
  await assert.rejects(
    recordUnitPlacement(ORG, basePlacement, deps),
    (err: unknown) => err instanceof SpineResolutionError && err.kind === 'unit',
  );
  assert.ok(!cap.queries.some((q) => q.sql.includes('INSERT')), 'no fact row');
  assert.equal(cap.opsEvents.length, 0);
});

test('placement: session attribution is threaded into the row and the event', async () => {
  const { deps, cap } = fakes();
  await recordUnitPlacement(
    ORG,
    { ...basePlacement, session: { sessionId: 7, sessionType: 'unbox' } },
    deps,
  );
  const insert = cap.queries.find((q) => q.sql.includes('INSERT INTO unit_placements'));
  assert.ok(insert);
  assert.equal(insert.params[7], 7); // session_id
  assert.equal(insert.params[8], 'unbox'); // session_type
  assert.deepEqual(cap.opsEvents[0].session, { sessionId: 7, sessionType: 'unbox' });
});

test('placement: clientEventId is minted when the caller has none', async () => {
  const { deps, cap } = fakes();
  const { clientEventId: _omitted, ...withoutKey } = basePlacement;
  await recordUnitPlacement(ORG, withoutKey, deps);
  const insert = cap.queries.find((q) => q.sql.includes('INSERT INTO unit_placements'));
  assert.ok(insert);
  assert.equal(insert.params[9], 'minted-1');
  assert.equal(cap.opsEvents[0].clientEventId, 'minted-1:ops');
});

const basePull = {
  donorScan: { value: 'SN-DONOR-9', source: 'scanner' } as const,
  locationScan: { value: 'TECH-PARTS', source: 'scanner' } as const,
  partLabel: '  battery  ',
  pulledBy: 3,
  session: NO_SESSION,
  clientEventId: 'pull-1',
};

test('part pull: happy path trims the label, defaults quantity, reports the event', async () => {
  const { deps, cap } = fakes();
  const out = await recordPartPull(ORG, basePull, deps);

  assert.deepEqual(out, {
    partPullId: 777,
    donorSerialUnitId: 42,
    toLocationId: 12,
    alreadyRecorded: false,
  });
  const insert = cap.queries.find((q) => q.sql.includes('INSERT INTO part_pulls'));
  assert.ok(insert);
  assert.equal(insert.params[0], ORG);
  assert.equal(insert.params[2], 'battery'); // trimmed, the org's own words
  assert.equal(insert.params[5], 1); // quantity default
  assert.equal(cap.opsEvents.length, 1);
  assert.equal(cap.opsEvents[0].eventType, 'unit.part_pulled');
});

test('part pull: refuses a blank label and a non-positive quantity, before IO', async () => {
  const { deps, cap } = fakes();
  await assert.rejects(recordPartPull(ORG, { ...basePull, partLabel: '   ' }, deps));
  await assert.rejects(recordPartPull(ORG, { ...basePull, quantity: 0 }, deps));
  assert.equal(cap.transactionOrgs.length, 0);
});

test('part pull: the location law holds here too', async () => {
  const { deps } = fakes();
  await assert.rejects(
    recordPartPull(
      ORG,
      { ...basePull, locationScan: { value: 'TECH-PARTS', source: 'human' } },
      deps,
    ),
    LocationScanLawError,
  );
});

test('part pull: idempotent replay is silent', async () => {
  const { deps, cap } = fakes({ insertRows: [] });
  const out = await recordPartPull(ORG, basePull, deps);
  assert.equal(out.alreadyRecorded, true);
  assert.equal(out.partPullId, null);
  assert.equal(cap.opsEvents.length, 0);
});
