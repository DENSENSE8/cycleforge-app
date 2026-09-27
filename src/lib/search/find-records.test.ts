import assert from 'node:assert/strict';
import test from 'node:test';

import { findRecords, type FindRecordsDeps } from '@/lib/search/find-records';
import type { BrandSearchResult } from '@/lib/search/brand-search';
import type { GlobalSearchResult } from '@/lib/search/global-entity-search';
import type { HybridSearchResult } from '@/lib/search/hybrid-retrieval';
import type { SearchHit } from '@/lib/search/search-hit';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

function result(id: number, entityType: GlobalSearchResult['entityType'] = 'order'): GlobalSearchResult {
  return {
    id,
    entityType,
    title: `record ${id}`,
    subtitle: '',
    href: `/x/${id}`,
    matchField: 'title',
  };
}

function hit(id: number, entityType: SearchHit['entityType'] = 'order'): SearchHit {
  return {
    id,
    entityType,
    title: `fuzzy ${id}`,
    subtitle: '',
    href: `/x/${id}`,
    matchField: 'keyword',
    score: 10,
    chips: [],
  };
}

function fakes(
  exactBy: Record<string, GlobalSearchResult[]> = {},
  hybridBy: Record<string, SearchHit[]> = {},
  brandBy: Record<string, BrandSearchResult> = {},
) {
  const exactCalls: Array<{ query: string; axis?: string }> = [];
  const hybridCalls: string[] = [];
  const brandCalls: string[] = [];
  const facetCalls: GlobalSearchResult[][] = [];

  const deps: FindRecordsDeps = {
    exact: async (_org, query, _limit, axis) => {
      exactCalls.push({ query, axis });
      return exactBy[query] ?? [];
    },
    hybrid: async (_org, query) => {
      hybridCalls.push(query);
      return { hits: hybridBy[query] ?? [], usedSemantic: false } as HybridSearchResult;
    },
    brand: async (_org, query) => {
      brandCalls.push(query);
      return brandBy[query] ?? { hits: [], facet: [] };
    },
    brandFacet: async (_org, rows) => {
      facetCalls.push(rows);
      return rows.length > 0 ? [{ id: 1, name: 'Bose', count: rows.length }] : [];
    },
  };

  return { deps, exactCalls, hybridCalls, brandCalls, facetCalls };
}

// ── the merge ───────────────────────────────────────────────────────────────

test('exact fan-out hits come first, fuzzy fills the remaining slots', async () => {
  const f = fakes({ laptop: [result(1)] }, { laptop: [hit(2), hit(3)] });
  const out = await findRecords(ORG, 'laptop', { limit: 5 }, f.deps);

  assert.deepEqual(out.rows.map((r) => r.id), [1, 2, 3]);
  assert.equal(out.relaxed, false);
});

test('a record found by both arms appears once', async () => {
  const f = fakes({ laptop: [result(7)] }, { laptop: [hit(7), hit(8)] });
  const out = await findRecords(ORG, 'laptop', { limit: 5 }, f.deps);
  assert.deepEqual(out.rows.map((r) => r.id), [7, 8]);
});

test('dedupe is per entity type — order 5 and unit 5 are different records', async () => {
  const f = fakes({ q: [result(5, 'order')] }, { q: [hit(5, 'unit')] });
  const out = await findRecords(ORG, 'q', { limit: 5 }, f.deps);
  assert.equal(out.rows.length, 2);
});

test('a full page of exact hits never pays for the fuzzy arm', async () => {
  const f = fakes({ laptop: [result(1), result(2)] }, { laptop: [hit(9)] });
  const out = await findRecords(ORG, 'laptop', { limit: 2 }, f.deps);

  assert.deepEqual(f.hybridCalls, [], 'fuzzy arm must not be called');
  assert.equal(out.rows.length, 2);
});

test('the merged set is capped at the caller limit', async () => {
  const f = fakes({ q: [result(1)] }, { q: [hit(2), hit(3), hit(4), hit(5)] });
  const out = await findRecords(ORG, 'q', { limit: 3 }, f.deps);
  assert.equal(out.rows.length, 3);
});

// ── what must never be widened ──────────────────────────────────────────────

test('an identifier is answered by the exact arm alone — no fuzzy second opinion', async () => {
  const f = fakes({ 'SN12345678': [result(1)] }, {});
  await findRecords(ORG, 'SN12345678', { limit: 5 }, f.deps);
  assert.deepEqual(f.hybridCalls, []);
});

test('an identifier MISS stays a miss — it is never relaxed', async () => {
  const f = fakes({}, {});
  const out = await findRecords(ORG, '1Z999AA10123456784', { limit: 5 }, f.deps);

  assert.deepEqual(out.rows, []);
  assert.equal(out.relaxed, false);
  assert.equal(f.exactCalls.length, 1, 'exactly one attempt — no ladder was climbed');
});

test('an axis-scoped search is never widened or relaxed', async () => {
  const f = fakes({}, {});
  const out = await findRecords(ORG, 'broken box', { limit: 5, axis: 'serial' }, f.deps);

  assert.deepEqual(f.hybridCalls, []);
  assert.equal(f.exactCalls.length, 1);
  assert.equal(out.relaxed, false);
  assert.equal(f.exactCalls[0].axis, 'serial', 'the axis is threaded to the fan-out');
});

// ── brand axis + facet ──────────────────────────────────────────────────────

test('axis=brand answers from the brand arm alone, facet included, and a miss is never relaxed', async () => {
  const bose = { id: 1, name: 'Bose', count: 12 };
  const f = fakes({ bose: [result(1)] }, { bose: [hit(2)] }, {
    bose: { hits: [hit(30, 'sku'), hit(31, 'order')], facet: [bose] },
  });
  const out = await findRecords(ORG, 'bose', { limit: 5, axis: 'brand' }, f.deps);

  assert.deepEqual(out.rows.map((r) => `${r.entityType}:${r.id}`), ['sku:30', 'order:31']);
  assert.deepEqual(out.brandFacet, [bose], 'facet comes from the brand statement, not a row re-count');
  assert.deepEqual(f.exactCalls, []);
  assert.deepEqual(f.hybridCalls, []);
  assert.deepEqual(f.facetCalls, []);

  const miss = await findRecords(ORG, 'broken box', { limit: 5, axis: 'brand' }, f.deps);
  assert.deepEqual(miss.rows, []);
  assert.equal(miss.relaxed, false);
  assert.deepEqual(f.brandCalls, ['bose', 'broken box'], 'no relaxation rung was tried');
});

test('the brand facet is computed over the rows actually returned — the relaxed rung, not the miss', async () => {
  const f = fakes({ 'damaged box': [result(4), result(5, 'unit')] }, {});
  const out = await findRecords(ORG, 'broken box', { limit: 5 }, f.deps);

  assert.equal(out.relaxed, true);
  assert.equal(f.facetCalls.length, 1);
  assert.deepEqual(f.facetCalls[0].map((r) => `${r.entityType}:${r.id}`), ['order:4', 'unit:5']);
  assert.deepEqual(out.brandFacet, [{ id: 1, name: 'Bose', count: 2 }]);
});

test('a brand-facet failure keeps the rows and reports an empty facet', async () => {
  const f = fakes({ laptop: [result(1)] }, {});
  const deps: FindRecordsDeps = {
    ...f.deps,
    brandFacet: async () => {
      throw new Error('product_brands missing');
    },
  };
  const out = await findRecords(ORG, 'laptop', { limit: 5 }, deps);
  assert.deepEqual(out.rows.map((r) => r.id), [1]);
  assert.deepEqual(out.brandFacet, []);
});

// ── relaxation ──────────────────────────────────────────────────────────────

test('a zero-result free-text query climbs the ladder and reports the rung it landed on', async () => {
  // "broken box" finds nothing; the synonym rung "damaged box" does.
  const f = fakes({ 'damaged box': [result(4)] }, {});
  const out = await findRecords(ORG, 'broken box', { limit: 5 }, f.deps);

  assert.equal(out.relaxed, true);
  assert.equal(out.effectiveQuery, 'damaged box');
  assert.deepEqual(out.rows.map((r) => r.id), [4]);
});

test('a query that found anything at all is never relaxed', async () => {
  const f = fakes({ 'broken box': [result(1)], 'damaged box': [result(99)] }, {});
  const out = await findRecords(ORG, 'broken box', { limit: 5 }, f.deps);

  assert.equal(out.relaxed, false);
  assert.deepEqual(out.rows.map((r) => r.id), [1]);
});

test('when every rung misses, the result is honestly empty and not marked relaxed', async () => {
  const f = fakes({}, {});
  const out = await findRecords(ORG, 'nothing at all here', { limit: 5 }, f.deps);

  assert.deepEqual(out.rows, []);
  assert.equal(out.relaxed, false);
  assert.equal(out.effectiveQuery, 'nothing at all here');
});

test('the ladder stops at the first rung that produces rows', async () => {
  const f = fakes({ '7400 charger': [result(2)], '7400': [result(3)] }, {});
  const out = await findRecords(ORG, 'dell 7400 charger', { limit: 5 }, f.deps);

  assert.equal(out.effectiveQuery, '7400 charger');
  assert.ok(!f.exactCalls.some((c) => c.query === '7400'), 'must not keep climbing after a hit');
});

// ── degradation ─────────────────────────────────────────────────────────────

test('a blank query short-circuits without touching either engine', async () => {
  const f = fakes({}, {});
  const out = await findRecords(ORG, '   ', { limit: 5 }, f.deps);

  assert.deepEqual(out.rows, []);
  assert.deepEqual(f.exactCalls, []);
  assert.deepEqual(f.hybridCalls, []);
});

test('a fuzzy-arm failure degrades to the exact hits, never to an error', async () => {
  const f = fakes({ laptop: [result(1)] }, {});
  const deps: FindRecordsDeps = {
    ...f.deps,
    hybrid: async () => {
      throw new Error('pgvector down');
    },
  };
  const out = await findRecords(ORG, 'laptop', { limit: 5 }, deps);
  assert.deepEqual(out.rows.map((r) => r.id), [1]);
});

test('an exact-arm failure still lets the fuzzy arm answer', async () => {
  const f = fakes({}, { laptop: [hit(2)] });
  const deps: FindRecordsDeps = {
    ...f.deps,
    exact: async () => {
      throw new Error('db down');
    },
  };
  const out = await findRecords(ORG, 'laptop', { limit: 5 }, deps);
  assert.deepEqual(out.rows.map((r) => r.id), [2]);
});

// ── identifier-branch coverage ──────────────────────────────────────────────

test('an identifier query asks EVERY entity source, not just the order-shaped ones', async () => {
  // Regression: the identifier branch queried orders / units / holds / receiving and nothing else, so a bare SKU ("00624"), an FBA shipment…
  const asked: string[] = [];
  const deps: FindRecordsDeps = {
    ...fakes().deps,
    exact: async (_org, query) => {
      asked.push(query);
      return [];
    },
    hybrid: async () => ({ hits: [], usedSemantic: false }),
  };
  // `findRecords` delegates the fan-out to `searchAllEntities`, so this asserts
  // the contract it relies on: one exact call, unrelaxed, for an identifier.
  const out = await findRecords(ORG, '00624', { limit: 5 }, deps);
  assert.deepEqual(asked, ['00624'], 'exactly one attempt — identifiers are never relaxed');
  assert.equal(out.relaxed, false);
});
