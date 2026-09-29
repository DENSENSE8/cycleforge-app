import test from 'node:test';
import assert from 'node:assert/strict';
import { getNavFacets, type NavFacetsDeps } from './service';
import { NAV_FACET_GROUPS, type NavFacetContext } from './contexts';
import type { LocalPickupLineRow } from '@/lib/local-pickup/pickup-lines-query';
import type { DeskRefinements } from '@/lib/orders/desk-view-filters';
import {
  sqlDeskQueueScope,
  sqlDeskRefinementClauses,
  sqlOrderAssignedToStaff,
  type DeskAgingBucket,
  type DeskStage,
} from '@/lib/orders/desk-view-sql';

const ORG = '00000000-0000-0000-0000-000000000001';
const DESK = { orgId: ORG, permissions: new Set(['orders.view']) };
const noPickup: NavFacetsDeps['listLocalPickupLines'] = async () => [];
const noExceptions: NavFacetsDeps['exceptionCounts'] = async () => ({});

/** One order as the list sees it after its own predicates. */
interface FixtureOrder {
  stage: DeskStage;
  aging: DeskAgingBucket;
  urgent: boolean;
  blocked: boolean;
  /** Latest live PACK / PICK assignee (`?packedBy` / `?pickerId`; `?staff` = either). */
  packer: number;
  pickAssignee: number;
  /** Who picked it (`?pickedBy`); null = not picked. */
  picker: number | null;
  /** Warehouse civil days. */
  orderDay: string;
  shipByDay: string | null;
}

const STAGES: DeskStage[] = ['pending', 'picked', 'packed'];
const AGINGS: DeskAgingBucket[] = ['overdue', 'today', 'upcoming', 'unscheduled'];

function fixtureOrders(): FixtureOrder[] {
  const out: FixtureOrder[] = [];
  let i = 0;
  for (const stage of STAGES) {
    for (const aging of AGINGS) {
      for (const urgent of [false, true]) {
        for (const blocked of [false, true]) {
          // Uneven multiplicities so a wrong sum cannot pass by symmetry.
          const copies = (i++ % 4) + (stage === 'picked' ? 2 : 0);
          for (let k = 0; k < copies; k++) {
            const j = out.length;
            out.push({
              stage, aging, urgent, blocked,
              packer: 10 + (j % 3),
              pickAssignee: 20 + (j % 2),
              picker: j % 4 === 0 ? null : 30 + (j % 3),
              orderDay: `2026-09-${String(10 + (j % 6))}`,
              shipByDay: aging === 'unscheduled' ? null : `2026-09-${String(20 + (j % 5))}`,
            });
          }
        }
      }
    }
  }
  return out;
}

/** The desk list's own filter, evaluated per order (UnshippedTable + /api/orders semantics). */
function listRows(orders: FixtureOrder[], params: Record<string, string>): FixtureOrder[] {
  const truthy = (v: string | undefined) => v === '1' || v === 'true';
  const id = (v: string | undefined) => (v && /^\d+$/.test(v.trim()) && Number(v) > 0 ? Number(v) : null);
  const day = (v: string | undefined) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null;
  const stage = (params.stage ?? '').toLowerCase();
  const aging = (params.aging ?? '').toLowerCase();
  const staff = Number(params.staff) > 0 ? Number(params.staff) : null;
  const [packedBy, pickerId, pickedBy] = [id(params.packedBy), id(params.pickerId), id(params.pickedBy)];
  const [orderFrom, orderTo] = [day(params.orderFrom), day(params.orderTo)];
  const [shipByFrom, shipByTo] = [day(params.shipByFrom), day(params.shipByTo)];
  return orders.filter((o) => {
    if ((STAGES as string[]).includes(stage) && o.stage !== stage) return false;
    if ((AGINGS as string[]).includes(aging) && o.aging !== aging) return false;
    if (truthy(params.late) && !(o.aging === 'overdue' || o.aging === 'today')) return false;
    if (truthy(params.attention) && !o.urgent) return false;
    if ((params.ustatus ?? '').trim().toUpperCase() === 'BLOCKED' && !o.blocked) return false;
    if (staff != null && o.packer !== staff && o.pickAssignee !== staff) return false;
    if (packedBy != null && o.packer !== packedBy) return false;
    if (pickerId != null && o.pickAssignee !== pickerId) return false;
    if (pickedBy != null && o.picker !== pickedBy) return false;
    if (orderFrom && o.orderDay < orderFrom) return false;
    if (orderTo && o.orderDay > orderTo) return false;
    if ((shipByFrom || shipByTo) && o.shipByDay == null) return false;
    if (shipByFrom && o.shipByDay! < shipByFrom) return false;
    if (shipByTo && o.shipByDay! > shipByTo) return false;
    return true;
  });
}

async function facetsBody(context: NavFacetContext, params: URLSearchParams, deps: NavFacetsDeps) {
  const res = await getNavFacets(DESK, context, params, deps);
  assert.ok(res.ok);
  return res.body;
}

const NO_REFINEMENTS: DeskRefinements = {
  packedBy: null, pickerId: null, pickedBy: null, orderFrom: null, orderTo: null, shipByFrom: null, shipByTo: null,
};

/** The facet statement's text for ONE refinement bound at `ref`. */
function refinementSql(one: Partial<DeskRefinements>, ref: string): string {
  return sqlDeskRefinementClauses({ ...NO_REFINEMENTS, ...one }, () => ref, 'o', 'dl.deadline_at')[0];
}

/** Each SQL-bound predicate the facet statement may carry, and what it means for a fixture order. */
const BOUND_FILTERS: Array<{ sql: (ref: string) => string; keep: (o: FixtureOrder, value: unknown) => boolean }> = [
  { sql: (ref) => sqlOrderAssignedToStaff(ref), keep: (o, v) => o.packer === v || o.pickAssignee === v },
  { sql: (ref) => refinementSql({ packedBy: 1 }, ref), keep: (o, v) => o.packer === v },
  { sql: (ref) => refinementSql({ pickerId: 1 }, ref), keep: (o, v) => o.pickAssignee === v },
  { sql: (ref) => refinementSql({ pickedBy: 1 }, ref), keep: (o, v) => o.picker === v },
  { sql: (ref) => refinementSql({ orderFrom: 'x' }, ref), keep: (o, v) => o.orderDay >= String(v) },
  { sql: (ref) => refinementSql({ orderTo: 'x' }, ref), keep: (o, v) => o.orderDay <= String(v) },
  { sql: (ref) => refinementSql({ shipByFrom: 'x' }, ref), keep: (o, v) => o.shipByDay != null && o.shipByDay >= String(v) },
  { sql: (ref) => refinementSql({ shipByTo: 'x' }, ref), keep: (o, v) => o.shipByDay != null && o.shipByDay <= String(v) },
];

/**
 * Stand-in for Postgres: applies each predicate the statement actually binds
 * (found by its exact text at its placeholder), then GROUP BY → combination
 * rows with counts. A bound value no predicate reads fails the test.
 */
function comboRunner(orders: FixtureOrder[], captured: Array<{ sql: string; params: readonly unknown[] }> = []): NavFacetsDeps {
  return {
    listLocalPickupLines: noPickup,
    exceptionCounts: noExceptions,
    run: async (_orgId, sql, params) => {
      captured.push({ sql, params });
      let scoped = orders;
      for (let i = 2; i <= params.length; i++) {
        const hits = BOUND_FILTERS.filter((f) => sql.includes(f.sql(`$${i}`)));
        assert.equal(hits.length, 1, `bound param $${i} is read by exactly one known predicate`);
        scoped = scoped.filter((o) => hits[0].keep(o, params[i - 1]));
      }
      const byKey = new Map<string, Record<string, unknown>>();
      for (const o of scoped) {
        const key = `${o.stage}|${o.aging}|${o.urgent}|${o.blocked}`;
        const row = byKey.get(key) ?? { stage: o.stage, aging: o.aging, urgent: o.urgent, blocked: o.blocked, n: 0 };
        row.n = (row.n as number) + 1;
        byKey.set(key, row);
      }
      return [...byKey.values()];
    },
  };
}

/** Sidebar refinements — each narrows the fixture (asserted below). */
const REFINEMENT_CASES: Array<Record<string, string>> = [
  { staff: '11' },
  { packedBy: '11' },
  { pickerId: '20', stage: 'picked' },
  { pickedBy: '31' },
  { pickedBy: '32', late: '1' },
  { orderFrom: '2026-09-12' },
  { orderTo: '2026-09-11', attention: '1' },
  { orderFrom: '2026-09-12', orderTo: '2026-09-13' },
  { shipByFrom: '2026-09-22' },
  { shipByTo: '2026-09-21' },
  { shipByFrom: '2026-09-20', shipByTo: '2026-09-20', ustatus: 'BLOCKED' },
  { staff: '20', packedBy: '12', pickedBy: '32', orderFrom: '2026-09-11', shipByTo: '2026-09-23' },
];

const PARAM_CASES: Array<Record<string, string>> = [
  {},
  { stage: 'picked' },
  { stage: 'PACKED', aging: 'overdue' },
  { late: '1' },
  { late: 'true', attention: '1' },
  { attention: 'true', ustatus: 'blocked' },
  { stage: 'pending', aging: 'today', late: '1', attention: '1', ustatus: 'BLOCKED' },
  { stage: 'bogus', aging: 'someday', late: 'yes' }, // values the list ignores
  { pickedBy: 'abc', packedBy: '-4', pickerId: '1.5', orderFrom: '2026-13-45', orderTo: '09/20/2026', shipByFrom: 'x', shipByTo: '' },
  ...REFINEMENT_CASES,
];

test('every refinement case narrows the fixture, so the equality below is a real check', () => {
  const orders = fixtureOrders();
  for (const params of REFINEMENT_CASES) {
    const n = listRows(orders, params).length;
    assert.ok(n > 0 && n < orders.length, `${JSON.stringify(params)} → ${n} of ${orders.length}`);
  }
});

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
  const picked = await facetsBody('outbound.triage', new URLSearchParams({ stage: 'picked' }), comboRunner(orders));
  assert.deepEqual(
    picked.groups.find((g) => g.id === 'stage')?.options,
    unfiltered.groups.find((g) => g.id === 'stage')?.options,
  );
  assert.equal(picked.total, unfiltered.groups.find((g) => g.id === 'stage')?.options.find((o) => o.value === 'picked')?.count);
});

test('PO paired returns only its declared groups, yet an undeclared list param still narrows the total', async () => {
  const orders = fixtureOrders();
  const res = await facetsBody('outbound.po', new URLSearchParams({ stage: 'picked' }), comboRunner(orders));
  assert.deepEqual(res.groups.map((g) => g.id), NAV_FACET_GROUPS['outbound.po'].map((g) => g.id));
  assert.equal(res.total, listRows(orders, { stage: 'picked' }).length);
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

test('a context is refused (403) without its list endpoint’s permission, before any read', async () => {
  const captured: Array<{ sql: string; params: readonly unknown[] }> = [];
  const deps = comboRunner([], captured);
  const res = await getNavFacets({ orgId: ORG, permissions: new Set(['walk_in.view']) }, 'outbound.triage', new URLSearchParams(), deps);
  assert.deepEqual(res, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'orders.view' });
  assert.equal(captured.length, 0);
});

test('pickup: status counts are the workbench grid counts over the same line read', async () => {
  const line = (order_id: number, order_status: string, receiving_id: number | null) => ({ order_id, order_status, receiving_id }) as LocalPickupLineRow;
  const lines = [
    line(1, 'DRAFT', null), line(1, 'DRAFT', null), // one two-line pickup card
    line(2, 'DRAFT', null), // second need-to-process pickup
    line(3, 'DRAFT', 812), // draft, already processing
    line(4, 'COMPLETED', 813), line(5, 'COMPLETED', null), line(6, 'COMPLETED', 9),
  ];
  const reads: unknown[] = [];
  const deps: NavFacetsDeps = {
    run: async () => { throw new Error('pickup facets read the line feed, not SQL'); },
    listLocalPickupLines: async (_org, query) => { reads.push(query); return lines; },
    exceptionCounts: noExceptions,
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
