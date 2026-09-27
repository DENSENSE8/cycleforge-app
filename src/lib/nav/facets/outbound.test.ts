import test from 'node:test';
import assert from 'node:assert/strict';
import { getNavFacets, type NavFacetsDeps } from './service';
import { NAV_FACET_GROUPS, type NavFacetContext } from './contexts';
import type { LocalPickupLineRow } from '@/lib/local-pickup/pickup-lines-query';
import { sqlDeskQueueScope, type DeskAgingBucket, type DeskStage } from '@/lib/orders/desk-view-sql';

const ORG = '00000000-0000-0000-0000-000000000001';
const DESK = { orgId: ORG, permissions: new Set(['orders.view']) };
const noPickup: NavFacetsDeps['listLocalPickupLines'] = async () => [];

/** One order as the list sees it after its own predicates. */
interface FixtureOrder {
  stage: DeskStage;
  aging: DeskAgingBucket;
  urgent: boolean;
  blocked: boolean;
}

const STAGES: DeskStage[] = ['pending', 'tested', 'packed'];
const AGINGS: DeskAgingBucket[] = ['overdue', 'today', 'upcoming', 'unscheduled'];

function fixtureOrders(): FixtureOrder[] {
  const out: FixtureOrder[] = [];
  let i = 0;
  for (const stage of STAGES) {
    for (const aging of AGINGS) {
      for (const urgent of [false, true]) {
        for (const blocked of [false, true]) {
          // Uneven multiplicities so a wrong sum cannot pass by symmetry.
          const copies = (i++ % 4) + (stage === 'tested' ? 2 : 0);
          for (let k = 0; k < copies; k++) out.push({ stage, aging, urgent, blocked });
        }
      }
    }
  }
  return out;
}

/** The desk list's own filter, evaluated per order (UnshippedTable + /api/orders semantics). */
function listRows(orders: FixtureOrder[], params: Record<string, string>): FixtureOrder[] {
  const truthy = (v: string | undefined) => v === '1' || v === 'true';
  const stage = (params.stage ?? '').toLowerCase();
  const aging = (params.aging ?? '').toLowerCase();
  return orders.filter((o) => {
    if ((STAGES as string[]).includes(stage) && o.stage !== stage) return false;
    if ((AGINGS as string[]).includes(aging) && o.aging !== aging) return false;
    if (truthy(params.late) && !(o.aging === 'overdue' || o.aging === 'today')) return false;
    if (truthy(params.attention) && !o.urgent) return false;
    if ((params.ustatus ?? '').trim().toUpperCase() === 'BLOCKED' && !o.blocked) return false;
    return true;
  });
}

async function facetsBody(context: NavFacetContext, params: URLSearchParams, deps: NavFacetsDeps) {
  const res = await getNavFacets(DESK, context, params, deps);
  assert.ok(res.ok);
  return res.body;
}

/** Stand-in for Postgres' GROUP BY over the scoped orders: combination rows with counts. */
function comboRunner(orders: FixtureOrder[], captured: Array<{ sql: string; params: readonly unknown[] }> = []): NavFacetsDeps {
  return {
    listLocalPickupLines: noPickup,
    run: async (_orgId, sql, params) => {
      captured.push({ sql, params });
      const byKey = new Map<string, Record<string, unknown>>();
      for (const o of orders) {
        const key = `${o.stage}|${o.aging}|${o.urgent}|${o.blocked}`;
        const row = byKey.get(key) ?? { ...o, n: 0 };
        row.n = (row.n as number) + 1;
        byKey.set(key, row);
      }
      return [...byKey.values()];
    },
  };
}

const PARAM_CASES: Array<Record<string, string>> = [
  {},
  { stage: 'tested' },
  { stage: 'PACKED', aging: 'overdue' },
  { late: '1' },
  { late: 'true', attention: '1' },
  { attention: 'true', ustatus: 'blocked' },
  { stage: 'pending', aging: 'today', late: '1', attention: '1', ustatus: 'BLOCKED' },
  { stage: 'bogus', aging: 'someday', late: 'yes' }, // values the list ignores
];

for (const context of ['outbound.triage', 'outbound.pick', 'outbound.po'] as const) {
  test(`${context}: total and every option count equal the list total for the same params`, async () => {
    const orders = fixtureOrders();
    for (const params of PARAM_CASES) {
      const res = await facetsBody(context, new URLSearchParams(params), comboRunner(orders));
      assert.equal(res.total, listRows(orders, params).length, `total for ${JSON.stringify(params)}`);
      for (const group of res.groups) {
        for (const option of group.options) {
          const picked = { ...params, [group.param]: option.value };
          assert.equal(
            option.count,
            listRows(orders, picked).length,
            `${group.id}=${option.value} under ${JSON.stringify(params)}`,
          );
        }
      }
    }
  });
}

test('partition groups (stage, ship-by) sum to the list total while their own param is unset', async () => {
  const orders = fixtureOrders();
  for (const params of [{}, { attention: '1' }, { late: '1', ustatus: 'BLOCKED' }]) {
    const res = await facetsBody('outbound.triage', new URLSearchParams(params), comboRunner(orders));
    for (const id of ['stage', 'aging']) {
      const group = res.groups.find((g) => g.id === id);
      assert.ok(group);
      assert.equal(group.options.reduce((sum, o) => sum + o.count, 0), res.total, `${id} under ${JSON.stringify(params)}`);
    }
  }
});

test('a group never narrows its own options: picking a stage keeps the sibling stage counts', async () => {
  const orders = fixtureOrders();
  const unfiltered = await facetsBody('outbound.triage', new URLSearchParams(), comboRunner(orders));
  const picked = await facetsBody('outbound.triage', new URLSearchParams({ stage: 'tested' }), comboRunner(orders));
  assert.deepEqual(
    picked.groups.find((g) => g.id === 'stage')?.options,
    unfiltered.groups.find((g) => g.id === 'stage')?.options,
  );
  assert.equal(picked.total, unfiltered.groups.find((g) => g.id === 'stage')?.options.find((o) => o.value === 'tested')?.count);
});

test('PO paired returns only its declared groups, yet an undeclared list param still narrows the total', async () => {
  const orders = fixtureOrders();
  const res = await facetsBody('outbound.po', new URLSearchParams({ stage: 'tested' }), comboRunner(orders));
  assert.deepEqual(res.groups.map((g) => g.id), NAV_FACET_GROUPS['outbound.po'].map((g) => g.id));
  assert.equal(res.total, listRows(orders, { stage: 'tested' }).length);
});

test('queue facets read the list predicates: the view scope fragment, and ?staff= bound as a parameter', async () => {
  const captured: Array<{ sql: string; params: readonly unknown[] }> = [];
  await facetsBody('outbound.pick', new URLSearchParams({ staff: '42' }), comboRunner([], captured));
  await facetsBody('outbound.triage', new URLSearchParams({ staff: '-3' }), comboRunner([], captured));
  assert.equal(captured.length, 2, 'one statement per facet request');
  assert.ok(captured[0].sql.includes(sqlDeskQueueScope('pick')));
  assert.deepEqual(captured[0].params, [ORG, 42]);
  // A staff value the list rejects is not a filter.
  assert.deepEqual(captured[1].params, [ORG]);
});

test('exceptions: category counts are the list totals per category; the search binds like the list (lower-cased)', async () => {
  const categoryCounts: Record<string, number> = { 'SKU Mapping': 4, 'Out of Stock': 9, 'Buyer Request': 2, 'Shipping Issue': 1, Other: 3 };
  const captured: Array<{ sql: string; params: readonly unknown[] }> = [];
  const deps: NavFacetsDeps = {
    listLocalPickupLines: noPickup,
    run: async (_orgId, sql, params) => {
      captured.push({ sql, params });
      return Object.entries(categoryCounts).map(([category, n]) => ({ category, n }));
    },
  };
  const all = await facetsBody('outbound.exceptions', new URLSearchParams({ search: '  Bose 700 ' }), deps);
  assert.equal(all.total, 19);
  const options = all.groups[0].options;
  assert.equal(options.reduce((sum, o) => sum + o.count, 0), all.total);
  assert.equal(options.find((o) => o.value === 'Address Issue')?.count, 0);
  assert.deepEqual(captured[0].params, [ORG, '%bose 700%']);

  const picked = await facetsBody('outbound.exceptions', new URLSearchParams({ category: 'Out of Stock' }), deps);
  assert.equal(picked.total, 9);
  const unknown = await facetsBody('outbound.exceptions', new URLSearchParams({ category: 'out of stock' }), deps);
  assert.equal(unknown.total, 19, 'the workbench ignores a category that is not an exact vocabulary value');
});

test('a context is refused (403) without its list endpoint’s permission, before any read', async () => {
  const captured: Array<{ sql: string; params: readonly unknown[] }> = [];
  const deps = comboRunner([], captured);
  const res = await getNavFacets({ orgId: ORG, permissions: new Set(['walk_in.view']) }, 'outbound.triage', new URLSearchParams(), deps);
  assert.deepEqual(res, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'orders.view' });
  assert.equal(captured.length, 0);
});

test('pickup: status counts are the workbench grid counts over the same line read', async () => {
  const line = (order_status: string, receiving_id: number | null) => ({ order_status, receiving_id }) as LocalPickupLineRow;
  const lines = [
    line('DRAFT', null), line('DRAFT', null), // need to process (and draft)
    line('DRAFT', 812), // draft, already processing
    line('COMPLETED', 813), line('COMPLETED', null), line('COMPLETED', 9),
  ];
  const reads: unknown[] = [];
  const deps: NavFacetsDeps = {
    run: async () => { throw new Error('pickup facets read the line feed, not SQL'); },
    listLocalPickupLines: async (_org, query) => { reads.push(query); return lines; },
  };
  const caller = { orgId: ORG, permissions: new Set(['walk_in.view']) };
  const all = await getNavFacets(caller, 'pickup', new URLSearchParams({ q: ' flip ' }), deps);
  assert.ok(all.ok);
  assert.equal(all.body.total, 6);
  assert.deepEqual(all.body.groups[0].options.map((o) => [o.value, o.count]), [['process', 2], ['draft', 3], ['done', 3]]);
  assert.deepEqual(reads[0], { status: '', q: 'flip', limit: 500 });

  for (const [status, expected] of [['process', 2], ['draft', 3], ['DONE', 3], ['nonsense', 6]] as const) {
    const res = await getNavFacets(caller, 'pickup', new URLSearchParams({ status }), deps);
    assert.ok(res.ok);
    assert.equal(res.body.total, expected, status);
  }
});
