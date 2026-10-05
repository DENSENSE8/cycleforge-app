import test from 'node:test';
import assert from 'node:assert/strict';
import { getNavFacets, type NavFacetsDeps } from './service';
import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import type { NavFacetContext } from '@/lib/nav/facets/contexts';

const ORG = '00000000-0000-0000-0000-000000000001';
const STAFF = { orgId: ORG, permissions: new Set(['repair.view']) };

/** The list's rows, per stored status (what the statement returns). */
const STATUS_ROWS = [
  { status: 'Incoming Shipment', n: 3 },
  { status: 'Pending Repair', n: 4 },
  { status: 'Awaiting Parts', n: 1 },
  { status: 'Awaiting Pickup', n: 2 },
  { status: 'Done', n: 5 },
  { status: 'On hold (legacy)', n: 1 },
];

async function facets(context: NavFacetContext, qs: string, permissions = STAFF.permissions) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const deps: NavFacetsDeps = {
    run: async (orgId, sql, params) => {
      assert.equal(orgId, ORG);
      calls.push({ sql, params });
      return STATUS_ROWS;
    },
    listLocalPickupLines: async () => [],
    exceptionCounts: async () => ({}),
    supportRows: async () => [],
    liveFeedFacets: async () => ({ carrier: [], channel: [] }),
  };
  const result = await getNavFacets({ ...STAFF, permissions }, context, new URLSearchParams(qs), deps);
  return { result, calls };
}

const counts = (body: NavFacetsResponse) =>
  Object.fromEntries(body.groups.find((g) => g.id === 'repairStatus')!.options.map((o) => [o.value, o.count]));

test('repair facets are gated by repair.view (the list endpoint’s permission)', async () => {
  const { result } = await facets('repair.all', '', new Set(['orders.view']));
  assert.deepEqual(result, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'repair.view' });
});

test('every stage counts the list rows its statuses group into, in stage order, Other last', async () => {
  const { result } = await facets('repair.all', '');
  assert.ok(result.ok);
  assert.equal(result.body.total, 16);
  const group = result.body.groups[0]!;
  assert.equal(group.param, 'repairStatus');
  assert.deepEqual(counts(result.body), { arriving: 3, 'needs-work': 5, completed: 2, closed: 5, other: 1 });
});

test('a pick is any-of and narrows the total, never its own options; Exclude status drops its stages everywhere', async () => {
  const { result } = await facets('repair.all', 'repairStatus=arriving,completed,bogus');
  assert.ok(result.ok);
  assert.equal(result.body.total, 5);
  assert.equal(counts(result.body)['needs-work'], 5);
  const { result: hidden } = await facets('repair.all', 'hide=closed,other');
  assert.ok(hidden.ok);
  assert.equal(hidden.body.total, 10);
  assert.equal(counts(hidden.body).closed, 0);
});

test('the statement is the list’s: Status tab (surface default when unset), channel, label queue, Find and page cap', async () => {
  const { calls: desk } = await facets('repair.shipped-in', 'channel=shipment&needsLabel=1');
  const [{ sql, params }] = desk;
  assert.match(sql, /GROUP BY listed\.status/);
  assert.match(sql, /rs\.status NOT IN/, 'the /repair default is Open');
  assert.match(sql, /rs\.intake_channel = \$2/);
  assert.match(sql, /rs\.label_printed_at IS NULL/);
  assert.deepEqual(params, [ORG, 'shipment', 500, 0]);

  const { calls: sales } = await facets('sales.repairs-all', 'search=%20acme%20');
  assert.doesNotMatch(sales[0]!.sql, /rs\.status NOT IN/, 'the Sales default is every status');
  assert.deepEqual(sales[0]!.params, ['%acme%', ORG, 20, 0]);

  const { calls: done } = await facets('sales.repairs-all', 'tab=done');
  assert.match(done[0]!.sql, /WHERE rs\.status IN/);
});
