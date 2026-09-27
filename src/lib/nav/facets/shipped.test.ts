import test from 'node:test';
import assert from 'node:assert/strict';
import { getNavFacets, type NavFacetsDeps } from './service';
import {
  VALID_CARRIERS,
  VALID_STATUS,
  type ShippedTypeFilter,
} from '@/lib/shipping/shipped-filter/shipped-filter-constants';

const ORG = '00000000-0000-0000-0000-000000000001';
const DESK = { orgId: ORG, permissions: new Set(['packing.view']) };
const noPickup: NavFacetsDeps['listLocalPickupLines'] = async () => [];

const TYPES: ShippedTypeFilter[] = ['all', 'orders', 'sku', 'fba'];
const CARRIERS = ['UPS', 'USPS', 'FEDEX', ''];
const STATUSES = ['IN_TRANSIT', 'DELIVERED', 'EXCEPTION', ''];

/** One package as the list sees it: its rows' type memberships, and its own tracking facts. */
interface FixturePackage {
  rows: Array<Record<ShippedTypeFilter, boolean>>;
  carrier: string;
  status: string;
  exception: boolean;
}

const row = (...types: ShippedTypeFilter[]) =>
  Object.fromEntries(TYPES.map((t) => [t, types.includes(t)])) as Record<ShippedTypeFilter, boolean>;

function fixturePackages(): FixturePackage[] {
  const shapes = [
    [row('all', 'orders')],
    [row('all', 'fba')],
    [row('sku')],
    [row()], // an unlinked scan: in no view
    [row('all', 'orders'), row('sku')], // re-packed as SKU: listed under both views, once each
  ];
  const out: FixturePackage[] = [];
  let i = 0;
  for (const rows of shapes) {
    for (const carrier of CARRIERS) {
      for (const status of STATUSES) {
        for (const exception of [false, true]) {
          // Uneven multiplicities so a wrong sum cannot pass by symmetry.
          const copies = i++ % 3;
          for (let k = 0; k < copies; k++) out.push({ rows, carrier, status, exception });
        }
      }
    }
  }
  return out;
}

/**
 * The Shipped list for these params: the fetch's filters over the rows, then
 * one row per package (`dedupeShippedRecords`) — so a package shows when any
 * of its rows is in the type view. `shippedFilter` absent is the `all` view.
 */
function listPackages(packages: FixturePackage[], params: Record<string, string>): FixturePackage[] {
  const typeParam = params.shippedFilter ?? '';
  const type = (TYPES as string[]).includes(typeParam) ? (typeParam as ShippedTypeFilter) : 'all';
  const carrier = (params.carrier ?? '').toUpperCase();
  const status = (params.statusCategory ?? '').toUpperCase();
  const exceptions = ['1', 'true'].includes((params.exceptions ?? '').toLowerCase());
  return packages.filter((p) => {
    if (!p.rows.some((r) => r[type])) return false;
    if ((VALID_CARRIERS as Set<string>).has(carrier) && p.carrier !== carrier) return false;
    if ((VALID_STATUS as Set<string>).has(status) && p.status !== status) return false;
    if (exceptions && !p.exception) return false;
    return true;
  });
}

/** Stand-in for Postgres: per-package values (bool_or over its rows), counted per combination. */
function comboRunner(packages: FixturePackage[], captured: Array<{ sql: string; params: readonly unknown[] }> = []): NavFacetsDeps {
  return {
    listLocalPickupLines: noPickup,
    run: async (_orgId, sql, params) => {
      captured.push({ sql, params });
      const byKey = new Map<string, Record<string, unknown>>();
      for (const p of packages) {
        const combo = {
          t_all: p.rows.some((r) => r.all),
          t_orders: p.rows.some((r) => r.orders),
          t_sku: p.rows.some((r) => r.sku),
          t_fba: p.rows.some((r) => r.fba),
          carrier: p.carrier,
          status: p.status,
          exception: p.exception,
        };
        const key = JSON.stringify(combo);
        const entry = byKey.get(key) ?? { ...combo, n: 0 };
        entry.n = (entry.n as number) + 1;
        byKey.set(key, entry);
      }
      return [...byKey.values()];
    },
  };
}

async function facetsBody(params: URLSearchParams, deps: NavFacetsDeps) {
  const res = await getNavFacets(DESK, 'outbound.shipped', params, deps);
  assert.ok(res.ok);
  return res.body;
}

const PARAM_CASES: Array<Record<string, string>> = [
  {},
  { shippedFilter: 'orders' },
  { shippedFilter: 'sku', carrier: 'ups' },
  { shippedFilter: 'fba', statusCategory: 'in_transit' },
  { carrier: 'FEDEX', exceptions: '1' },
  { statusCategory: 'DELIVERED', exceptions: 'true' },
  { shippedFilter: 'all', carrier: 'USPS', statusCategory: 'EXCEPTION', exceptions: '1' },
  { shippedFilter: 'ORDERS', carrier: 'DHL', statusCategory: 'lost', exceptions: 'yes' }, // values the list ignores
];

test('outbound.shipped: total and every option count equal the Shipped list total for the same params', async () => {
  const packages = fixturePackages();
  for (const params of PARAM_CASES) {
    const res = await facetsBody(new URLSearchParams(params), comboRunner(packages));
    assert.equal(res.total, listPackages(packages, params).length, `total for ${JSON.stringify(params)}`);
    assert.deepEqual(res.groups.map((g) => g.param), ['shippedFilter', 'carrier', 'statusCategory', 'exceptions']);
    for (const group of res.groups) {
      for (const option of group.options) {
        const picked = { ...params, [group.param]: option.value };
        assert.equal(
          option.count,
          listPackages(packages, picked).length,
          `${group.id}=${option.value} under ${JSON.stringify(params)}`,
        );
      }
    }
  }
});

test('outbound.shipped: picking a carrier keeps the sibling carrier counts', async () => {
  const packages = fixturePackages();
  const unfiltered = await facetsBody(new URLSearchParams(), comboRunner(packages));
  const picked = await facetsBody(new URLSearchParams({ carrier: 'UPS' }), comboRunner(packages));
  const carriers = (body: typeof picked) => body.groups.find((g) => g.id === 'carrier')?.options;
  assert.deepEqual(carriers(picked), carriers(unfiltered));
  assert.equal(picked.total, carriers(unfiltered)?.find((o) => o.value === 'UPS')?.count);
});

test('outbound.shipped: the statement binds the list’s window (padded page + exact day clip) and staff filters', async () => {
  const captured: Array<{ sql: string; params: readonly unknown[] }> = [];
  const deps = comboRunner([], captured);
  await facetsBody(new URLSearchParams({ dateFrom: '2026-08-03', dateTo: '2026-08-07', staff: '7', carrier: 'UPS' }), deps);
  await facetsBody(new URLSearchParams({ allDates: '1', packedBy: '-2', testedBy: 'x' }), deps);
  assert.equal(captured.length, 2, 'one statement per facet request');
  // Carrier is counted per option, never bound: the group must not narrow itself.
  assert.deepEqual(captured[0].params, [ORG, 7, '2026-08-03', '2026-08-07', '2026-08-03', '2026-08-07']);
  // All dates: no window; staff values the list rejects are not filters.
  assert.deepEqual(captured[1].params, [ORG]);
});

test('outbound.shipped: a DB without packer_log_enrichment falls back to the legacy order match', async () => {
  const previous = process.env.PACKER_LOG_ENRICHMENT_READ;
  process.env.PACKER_LOG_ENRICHMENT_READ = 'true';
  try {
    const captured: string[] = [];
    const deps: NavFacetsDeps = {
      listLocalPickupLines: noPickup,
      run: async (_orgId, sql) => {
        captured.push(sql);
        if (sql.includes('packer_log_enrichment')) throw Object.assign(new Error('relation missing'), { code: '42P01' });
        return [{ t_all: true, t_orders: true, t_sku: false, t_fba: false, carrier: 'UPS', status: '', exception: false, n: 3 }];
      },
    };
    const body = await facetsBody(new URLSearchParams(), deps);
    assert.equal(body.total, 3);
    assert.equal(captured.length, 2);
  } finally {
    if (previous === undefined) delete process.env.PACKER_LOG_ENRICHMENT_READ;
    else process.env.PACKER_LOG_ENRICHMENT_READ = previous;
  }
});

test('outbound.shipped is refused (403) without the Shipped list’s permission, before any read', async () => {
  const captured: Array<{ sql: string; params: readonly unknown[] }> = [];
  const res = await getNavFacets(
    { orgId: ORG, permissions: new Set(['orders.view']) },
    'outbound.shipped',
    new URLSearchParams(),
    comboRunner([], captured),
  );
  assert.deepEqual(res, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'packing.view' });
  assert.equal(captured.length, 0);
});
