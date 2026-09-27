import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleFlight } from '@/lib/cache/single-flight';
import { sqlOrderAssignedToStaff, sqlOrderInWarehouseToShip } from '@/lib/orders/desk-view-sql';
import { buildOrdersListSql } from '@/lib/orders/orders-list';
import { parseOrdersListQuery } from '@/lib/orders/orders-list-query';
import type { UnshippedQueueCounts } from '@/lib/orders/queue-counts-normalize';
import type { PackPlacementCountRow } from '@/lib/packing/pack-placement';
import type { OrgId } from '@/lib/tenancy/constants';
import { getQueueCounts, type QueueCountsDeps, type QueueCountsTallies } from './queue-counts';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

const TALLIES: QueueCountsTallies = {
  groups: [
    // pre-pack: 5 untested (1 urgent), 3 tested (2 must-ship), 2 blocked untested
    { has_tech_scan: false, has_pack_scan: false, blocked: false, n: 5, urgent_n: 1, must_ship_n: 0 },
    { has_tech_scan: true, has_pack_scan: false, blocked: false, n: 3, urgent_n: 0, must_ship_n: 2 },
    { has_tech_scan: false, has_pack_scan: false, blocked: true, n: 2, urgent_n: 0, must_ship_n: 0 },
    // packed-staged, tested or not
    { has_tech_scan: true, has_pack_scan: true, blocked: false, n: 4, urgent_n: 1, must_ship_n: 1 },
    { has_tech_scan: false, has_pack_scan: true, blocked: false, n: 1, urgent_n: 0, must_ship_n: 0 },
  ],
  paperwork_incomplete: 6,
  shipped_today: 9,
};

const PLACEMENTS: PackPlacementCountRow[] = [
  { locationId: 1, locationName: 'Bench 1', locationBarcode: 'B1', locationKind: 'DESK', count: 2 },
  { locationId: 2, locationName: 'Staging', locationBarcode: null, locationKind: 'STAGING', count: 3 },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Captured {
  queries: { orgId: OrgId; sql: string; params: unknown[] }[];
  placements: OrgId[];
  gets: string[];
  sets: { key: string; payload: UnshippedQueueCounts }[];
}

function fakes(opts: { cached?: UnshippedQueueCounts | null; tallies?: () => Promise<QueueCountsTallies> } = {}) {
  const cap: Captured = { queries: [], placements: [], gets: [], sets: [] };
  const deps: QueueCountsDeps = {
    queryTallies: async (orgId, sql, params) => {
      cap.queries.push({ orgId, sql, params });
      return opts.tallies ? opts.tallies() : TALLIES;
    },
    countPlacements: async (orgId) => {
      cap.placements.push(orgId);
      return PLACEMENTS;
    },
    cacheGet: async (key) => {
      cap.gets.push(key);
      return opts.cached ?? null;
    },
    cacheSet: async (key, payload) => {
      cap.sets.push({ key, payload });
    },
    flight: createSingleFlight<UnshippedQueueCounts>(),
  };
  return { deps, cap };
}

test('a miss partitions the To-ship scope into stages and caches the payload', async () => {
  const { deps, cap } = fakes();
  const { payload, cache } = await getQueueCounts(ORG, { staffId: null }, deps);

  assert.equal(cache, 'MISS');
  assert.equal(payload.total, 15);
  assert.deepEqual(payload.byStage, { all: 15, tested: 3, pending: 7, packed: 5 });
  // Lane combos are pre-pack only; packed rows are their own stage.
  assert.deepEqual(payload.combos, [
    { hasTechScan: false, blocked: false, count: 5 },
    { hasTechScan: true, blocked: false, count: 3 },
    { hasTechScan: false, blocked: true, count: 2 },
  ]);
  assert.equal(payload.urgent, 2);
  assert.equal(payload.mustShip, 3);
  assert.equal(payload.paperworkIncomplete, 6);
  assert.equal(payload.shippedToday, 9);
  assert.deepEqual(payload.packPlacement, { counts: PLACEMENTS, totalPlaced: 5 });

  assert.equal(cap.queries.length, 1);
  assert.equal(cap.queries[0].orgId, ORG);
  assert.deepEqual(cap.queries[0].params, [ORG]);
  assert.deepEqual(cap.placements, [ORG]);
  assert.equal(cap.sets.length, 1);
  assert.equal(cap.sets[0].key, cap.gets[0]);
  assert.deepEqual(cap.sets[0].payload, payload);
});

test('a cache hit never touches the database', async () => {
  const cached = { total: 1 } as UnshippedQueueCounts;
  const { deps, cap } = fakes({ cached });
  const { payload, cache } = await getQueueCounts(ORG, { staffId: null }, deps);
  assert.equal(cache, 'HIT');
  assert.equal(payload, cached);
  assert.equal(cap.queries.length, 0);
  assert.equal(cap.placements.length, 0);
  assert.equal(cap.sets.length, 0);
});

test('concurrent cold misses run the tally SQL once and share its answer', async () => {
  const gate = deferred<QueueCountsTallies>();
  const { deps, cap } = fakes({ tallies: () => gate.promise });

  const first = getQueueCounts(ORG, { staffId: null }, deps);
  const second = getQueueCounts(ORG, { staffId: null }, deps);
  const third = getQueueCounts(ORG, { staffId: null }, deps);
  gate.resolve(TALLIES);
  const results = await Promise.all([first, second, third]);

  assert.equal(cap.queries.length, 1);
  assert.equal(cap.placements.length, 1);
  assert.equal(cap.sets.length, 1);
  assert.deepEqual(results.map((r) => r.cache).sort(), ['JOINED', 'JOINED', 'MISS']);
  assert.equal(results[1].payload, results[0].payload);
  assert.equal(results[2].payload, results[0].payload);
});

test('a staff-filtered read is its own cache entry and its own flight', async () => {
  const gate = deferred<QueueCountsTallies>();
  const { deps, cap } = fakes({ tallies: () => gate.promise });

  const all = getQueueCounts(ORG, { staffId: null }, deps);
  const mine = getQueueCounts(ORG, { staffId: 4 }, deps);
  gate.resolve(TALLIES);
  await Promise.all([all, mine]);

  assert.equal(cap.queries.length, 2);
  assert.notEqual(cap.gets[0], cap.gets[1]);
  const staffQuery = cap.queries.find((q) => q.params.length === 2);
  assert.deepEqual(staffQuery?.params, [ORG, 4]);
});

test('a failed rebuild fails every joined caller, caches nothing, and the next read retries', async () => {
  const gate = deferred<QueueCountsTallies>();
  let calls = 0;
  const { deps, cap } = fakes({
    tallies: () => {
      calls += 1;
      return calls === 1 ? gate.promise : Promise.resolve(TALLIES);
    },
  });

  const first = getQueueCounts(ORG, { staffId: null }, deps);
  const joined = getQueueCounts(ORG, { staffId: null }, deps);
  gate.reject(new Error('statement timeout'));
  await assert.rejects(first, /statement timeout/);
  await assert.rejects(joined, /statement timeout/);
  assert.equal(cap.sets.length, 0);

  const retry = await getQueueCounts(ORG, { staffId: null }, deps);
  assert.equal(retry.cache, 'MISS');
  assert.equal(cap.queries.length, 2);
});

test('the To-ship list and its counts filter with the same scope and staff predicates', async () => {
  const { deps, cap } = fakes();
  await getQueueCounts(ORG, { staffId: 4 }, deps);
  const countsSql = cap.queries[0].sql;

  const list = buildOrdersListSql(
    ORG,
    parseOrdersListQuery(new URLSearchParams('inWarehouse=true&listShape=queue&limit=200&staff=4')),
    { hasShortage: true, hasReplenishment: true },
  );

  const toShip = sqlOrderInWarehouseToShip('o');
  assert.ok(countsSql.includes(toShip), 'queue-counts must count the To-ship list scope');
  assert.ok(list.sql.includes(toShip), 'the To-ship list must filter with the scope its counters count');
  // The staff lens binds the same predicate in both (at their own param slots).
  assert.ok(countsSql.includes(sqlOrderAssignedToStaff('$2', 'o')));
  const staffSlot = list.params.indexOf(4) + 1;
  assert.ok(list.sql.includes(sqlOrderAssignedToStaff(`$${staffSlot}`, 'o')));
});
