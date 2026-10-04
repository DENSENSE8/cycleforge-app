import test from 'node:test';
import assert from 'node:assert/strict';
import { getNavFacets, type NavFacetsDeps } from './service';
import type { NavFacetsResponse } from '@/lib/nav/context/schema';

const ORG = '00000000-0000-0000-0000-000000000001';
const STAFF = { orgId: ORG, permissions: new Set(['orders.view']) };
const noPickup: NavFacetsDeps['listLocalPickupLines'] = async () => [];
const noExceptions: NavFacetsDeps['exceptionCounts'] = async () => ({});

/** The population the facet SQL would return (already narrowed by window / trigger / run / q). */
const ROW_COMBOS = [
  { source: 'google_sheets', platform: 'ebay', account: 'Main', outcome: 'inserted', n: 5 },
  { source: 'google_sheets', platform: 'ebay', account: 'Main', outcome: 'skipped', n: 2 },
  { source: 'google_sheets', platform: 'amazon', account: 'FBA', outcome: 'inserted', n: 1 },
  { source: 'shipstation', platform: 'ebay', account: 'Main', outcome: 'tracking_filled', n: 4 },
  { source: 'shipstation', platform: null, account: null, outcome: 'ambiguous', n: 3 },
  { source: 'square', platform: 'square', account: 'Store', outcome: 'inserted', n: 2 },
];
const RUN_COMBOS = [
  { status: 'success', sources: ['google_sheets', 'shipstation'], n: 3 },
  { status: 'failed', sources: ['shipstation'], n: 2 },
  { status: 'partial', sources: ['square'], n: 1 },
  { status: 'success', sources: [], n: 4 },
];

function harness(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const deps: NavFacetsDeps = {
    run: async (orgId, sql, params) => {
      assert.equal(orgId, ORG);
      calls.push({ sql, params });
      return rows;
    },
    listLocalPickupLines: noPickup,
    exceptionCounts: noExceptions,
    liveFeedCounts: async () => ({}),
  };
  return { calls, deps };
}

async function facets(context: 'imports.runs' | 'imports.rows', qs: string, rows: Array<Record<string, unknown>>) {
  const { calls, deps } = harness(rows);
  const result = await getNavFacets(STAFF, context, new URLSearchParams(qs), deps);
  assert.ok(result.ok);
  return { body: result.body, calls };
}

const counts = (body: NavFacetsResponse, group: string) =>
  Object.fromEntries(body.groups.find((g) => g.id === group)!.options.map((o) => [o.value, o.count]));

test('imports facets are gated by orders.view (the list endpoints’ permission)', async () => {
  const { deps } = harness([]);
  for (const context of ['imports.runs', 'imports.rows'] as const) {
    const result = await getNavFacets({ orgId: ORG, permissions: new Set(['packing.view']) }, context, new URLSearchParams(), deps);
    assert.deepEqual(result, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'orders.view' });
  }
});

test('rows: unfiltered, every option counts its rows and the total is the whole population', async () => {
  const { body } = await facets('imports.rows', '', ROW_COMBOS);
  assert.equal(body.total, 17);
  assert.deepEqual(counts(body, 'source'), { google_sheets: 8, shipstation: 7, square: 2 });
  assert.deepEqual(counts(body, 'account'), { FBA: 1, Main: 11, Store: 2 });
  // Outcome is a fixed vocabulary: every outcome is offered, empty ones at 0.
  const outcome = counts(body, 'outcome');
  assert.equal(Object.keys(outcome).length, 10);
  assert.deepEqual([outcome.inserted, outcome.tracking_filled, outcome.unchanged], [8, 4, 0]);
});

test('rows: Source = Google Sheets + Outcome = inserted narrows the total and the OTHER groups, never its own', async () => {
  const { body } = await facets('imports.rows', 'source=google_sheets&outcome=inserted', ROW_COMBOS);
  assert.equal(body.total, 6);
  // Source counts ignore the source pick but honour the outcome pick.
  assert.deepEqual(counts(body, 'source'), { google_sheets: 6, shipstation: 0, square: 2 });
  // Outcome counts honour the source pick only.
  const outcome = counts(body, 'outcome');
  assert.deepEqual([outcome.inserted, outcome.skipped, outcome.tracking_filled], [6, 2, 0]);
  // Platform / account honour both.
  assert.deepEqual(counts(body, 'platform'), { amazon: 1, ebay: 5, square: 0 });
});

test('rows: a multi-value pick is any-of, and a picked value absent from the data still shows at 0', async () => {
  const { body } = await facets('imports.rows', 'source=square,shipstation&account=Gone', ROW_COMBOS);
  assert.equal(body.total, 0);
  assert.equal(counts(body, 'account').Gone, 0);
  const { body: wide } = await facets('imports.rows', 'source=square,shipstation', ROW_COMBOS);
  assert.equal(wide.total, 9);
});

test('rows: the statement carries the non-facet filters and leaves the facet predicates to the counts', async () => {
  const { calls } = await facets(
    'imports.rows',
    'trigger=manual&run=12&q=50%_1&source=square&outcome=failed',
    ROW_COMBOS,
  );
  const [{ sql, params }] = calls;
  assert.match(sql, /w\.organization_id = \$1/);
  assert.match(sql, /r\.organization_id = w\.organization_id/);
  assert.ok(params.includes('manual'));
  assert.ok(params.includes(12));
  // Find is a literal substring: LIKE wildcards in the text are escaped.
  assert.ok(params.includes('%50\\%\\_1%'));
  assert.doesNotMatch(sql, /w\.source = ANY|w\.outcome = ANY/);
  // `run` pins the rows, so no default date window is bound.
  assert.doesNotMatch(sql, /w\.created_at >=/);
});

test('runs: a run counts under each source it ran; picking sources is any-of over runs', async () => {
  const { body } = await facets('imports.runs', '', RUN_COMBOS);
  assert.equal(body.total, 10);
  assert.deepEqual(counts(body, 'source'), { google_sheets: 3, shipstation: 5, square: 1 });
  const { body: picked } = await facets('imports.runs', 'source=shipstation,square', RUN_COMBOS);
  assert.equal(picked.total, 6);
});

test('runs: Status counts every status (0 included) under the other picks, never its own; the pick narrows the rest', async () => {
  const { body } = await facets('imports.runs', '', RUN_COMBOS);
  assert.deepEqual(counts(body, 'status'), { running: 0, success: 7, partial: 1, failed: 2 });
  const { body: failed } = await facets('imports.runs', 'status=failed', RUN_COMBOS);
  assert.equal(failed.total, 2);
  assert.deepEqual(counts(failed, 'status'), { running: 0, success: 7, partial: 1, failed: 2 });
  assert.deepEqual(counts(failed, 'source'), { google_sheets: 0, shipstation: 2, square: 0 });
  const { body: shipstation } = await facets('imports.runs', 'source=shipstation', RUN_COMBOS);
  assert.deepEqual(counts(shipstation, 'status'), { running: 0, success: 3, partial: 0, failed: 2 });
});

test('runs: trigger and who ran it narrow the statement, status and source are left to the counts; the default window is bound', async () => {
  const { calls } = await facets('imports.runs', 'status=partial&trigger=manual&staff=7&source=square', RUN_COMBOS);
  const [{ sql, params }] = calls;
  assert.match(sql, /r\.organization_id = \$1/);
  assert.match(sql, /r\.started_at >=/);
  assert.ok(params.includes('manual') && params.includes(7));
  assert.ok(!params.includes('partial'));
  assert.doesNotMatch(sql, /r\.status = |s\.step = ANY/);
});
