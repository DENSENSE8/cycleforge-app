import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import { getNavFacets, type NavFacetsDeps } from '@/lib/nav/facets/service';
import { countExceptions, getExceptionRecord, listExceptions, type ExceptionSources } from './hub';
import { EXCEPTION_KIND_PERMISSION } from './permissions';
import type { ExceptionSource } from './source';
import { cartonExceptionKind, cartonSource, type CartonFlags, type ExceptionCartonRow } from './sources/cartons';
import { orderQueueKind } from './sources/order-queue';
import { EXCEPTION_KINDS, EXCEPTION_KIND_SPEC, exceptionRowKey, type ExceptionKind, type ExceptionRow } from './types';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

// ── Membership: an order held for SKU mapping is `pairs`, never `fbm` ─────────

test('an order held for SKU mapping (caged, unpaired) is pairs; a paired or uncaged queued order is fbm', () => {
  // The split reads only the SKU-mapping hold, so an out-of-stock / buyer-note
  // order that is ALSO held for mapping still lands in pairs, never fbm.
  assert.equal(orderQueueKind({ release_state: 'caged', sku_catalog_id: null }), 'pairs');
  assert.equal(orderQueueKind({ release_state: 'caged', sku_catalog_id: '42' }), 'fbm');
  assert.equal(orderQueueKind({ release_state: 'released', sku_catalog_id: null }), 'fbm');
  assert.equal(orderQueueKind({ release_state: null, sku_catalog_id: null }), 'fbm');
});

// ── Receiving: one carton, one kind (Unfound › Claim › Short) ────────────────

function carton(id: number, flags: Partial<CartonFlags>): ExceptionCartonRow {
  return {
    receiving_id: id, lineless: false, unfound: false, claim: false, short: false,
    po_number: `PO-${id}`, zoho_purchaseorder_id: null, tracking: null, carrier: null, source: 'zoho_po',
    title: null, received: 1, expected: 2, unboxed_at: new Date(Date.UTC(2026, 8, id)).toISOString(), created_at: null,
    claims: flags.claim ? [{ code: 'DAMAGED', ticket: `#${id}` }] : null,
    ...flags,
  };
}

/** Fixture: unfound+short, claim+short, short only, a clean carton, a lineless unfound. */
const CARTONS: ExceptionCartonRow[] = [
  carton(1, { unfound: true, short: true }),
  carton(2, { claim: true, short: true }),
  carton(3, { short: true }),
  carton(4, {}),
  carton(5, { unfound: true, lineless: true }),
];

test('a carton sits in exactly one receiving kind — its most urgent flag — and a clean carton in none', () => {
  const kinds = Object.fromEntries(CARTONS.map((c) => [c.receiving_id, cartonExceptionKind(c)]));
  assert.deepEqual(kinds, { 1: 'unfound', 2: 'claim', 3: 'short', 4: null, 5: 'unfound' });
});

// ── Hub: counts == list, permission-hidden kinds absent everywhere ──────────

function fixedSource(kind: ExceptionKind, n: number): ExceptionSource {
  const rows: ExceptionRow[] = Array.from({ length: n }, (_, i) => ({
    key: exceptionRowKey(kind, String(i + 1)),
    kind,
    domain: EXCEPTION_KIND_SPEC[kind].domain,
    sourceId: String(i + 1),
    tag: { label: kind, tone: 'warning' },
    entity: { type: 'order', id: String(i + 1), label: `${kind}-${i + 1}` },
    title: null,
    detail: null,
    order: null,
    resolveVerb: 'Resolve',
    raisedAt: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
  }));
  return {
    kind,
    list: async () => rows,
    count: async () => rows.length,
    record: async (_ctx, id) => {
      const row = rows.find((r) => r.sourceId === id);
      return row ? { row, facts: { kind: 'bins', alert: {} } as never } : null;
    },
  };
}

function fixtureSources(): ExceptionSources {
  const feed = async () => CARTONS;
  const sources = Object.fromEntries(EXCEPTION_KINDS.map((kind, i) => [kind, fixedSource(kind, i + 1)])) as Record<
    ExceptionKind,
    ExceptionSource
  >;
  sources.claim = cartonSource('claim', feed);
  sources.short = cartonSource('short', feed);
  sources.unfound = cartonSource('unfound', feed);
  return sources;
}

const everyone = { orgId: ORG, has: () => true };

test('each kind’s count equals the rows the list returns for that kind, and a narrow page does not shrink the count', async () => {
  const sources = fixtureSources();
  const all = await listExceptions(everyone, { limit: 1000 }, sources);
  for (const kind of EXCEPTION_KINDS) {
    const only = await listExceptions(everyone, { kind, limit: 1000 }, sources);
    assert.equal(only.rows.length, all.counts[kind], kind);
    assert.ok(only.rows.every((row) => row.kind === kind), kind);
    const firstPage = await listExceptions(everyone, { kind, limit: 1 }, sources);
    assert.equal(firstPage.counts[kind], only.rows.length, `${kind}: count is the kind's total, not the page`);
  }
  assert.deepEqual(
    { claim: all.counts.claim, short: all.counts.short, unfound: all.counts.unfound },
    { claim: 1, short: 1, unfound: 2 },
  );
  assert.deepEqual(await countExceptions(everyone, null, null, sources), all.counts);
});

test('a kind the caller may not see is absent from rows, counts, facet totals and records', async () => {
  const sources = fixtureSources();
  const receivingOnly = { orgId: ORG, has: (permission: string) => permission === 'receiving.view' };
  const visible = EXCEPTION_KINDS.filter((kind) => EXCEPTION_KIND_PERMISSION[kind] === 'receiving.view');

  const res = await listExceptions(receivingOnly, { limit: 1000 }, sources);
  assert.deepEqual(Object.keys(res.counts).sort(), [...visible].sort());
  assert.ok(res.rows.every((row) => visible.includes(row.kind)));

  // Asking for a hidden kind by name returns nothing, not its rows.
  const hidden = await listExceptions(receivingOnly, { kind: 'fbm', limit: 1000 }, sources);
  assert.deepEqual(hidden.rows, []);
  assert.equal(hidden.counts.fbm, undefined);

  assert.deepEqual(Object.keys(await countExceptions(receivingOnly, null, null, sources)).sort(), [...visible].sort());
  assert.deepEqual(await getExceptionRecord(receivingOnly, 'fbm:1', sources), { ok: false, status: 403, error: 'FORBIDDEN' });
  const visibleRecord = await getExceptionRecord(receivingOnly, 'short:3', sources);
  assert.equal(visibleRecord.ok, true);

  const deps: NavFacetsDeps = {
    run: async () => { throw new Error('exceptions facets read the hub, not SQL'); },
    listLocalPickupLines: async () => [],
    exceptionCounts: (caller, kinds, q) => countExceptions(caller, kinds, q, sources),
    supportRows: async () => [],
    liveFeedFacets: async () => ({ carrier: [], channel: [] }),
  };
  const facetCaller = { orgId: ORG, permissions: new Set(['receiving.view']) };
  const allFacet = await getNavFacets(facetCaller, 'exceptions', new URLSearchParams(), deps);
  assert.ok(allFacet.ok);
  assert.equal(allFacet.body.total, visible.reduce((sum, kind) => sum + (res.counts[kind] ?? 0), 0));
  const hiddenFacet = await getNavFacets(facetCaller, 'exceptions.fbm', new URLSearchParams(), deps);
  assert.equal(hiddenFacet.ok, false);
});

test('a record that has left its kind (resolved) or a malformed key is a 404', async () => {
  const sources = fixtureSources();
  assert.equal((await getExceptionRecord(everyone, 'short:4', sources)).ok, false, 'the clean carton is no exception');
  assert.deepEqual(await getExceptionRecord(everyone, 'nope', sources), { ok: false, status: 404, error: 'Unknown exception' });
});

test('the list is newest first and pages with a cursor that covers every row once', async () => {
  const sources = fixtureSources();
  const all = (await listExceptions(everyone, { domain: 'inventory', limit: 1000 }, sources)).rows;
  const raised = all.map((row) => row.raisedAt).filter((v): v is string => v != null);
  assert.deepEqual(raised, [...raised].sort().reverse());
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await listExceptions(everyone, { domain: 'inventory', limit: 2, cursor }, sources);
    seen.push(...page.rows.map((row) => row.key));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(seen, all.map((row) => row.key));
});
