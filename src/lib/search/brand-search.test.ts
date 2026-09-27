/**
 * DB-free tests for the brand axis and the brand facet: the brand tree, alias
 * matcher and statement runner are injected fakes.
 * Run: node --test --require ./scripts/register-server-only-shim.cjs --import tsx src/lib/search/brand-search.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { BrandTokenMatch } from '@/lib/brands/lookup';
import type { BrandNode } from '@/lib/brands/tree';
import {
  brandFacetForResults,
  rollupBrandFacet,
  searchByBrand,
  type BrandSearchDeps,
} from './brand-search';

const ORG = '00000000-0000-0000-0000-0000000000b1' as OrgId;

function node(id: number, name: string, kind: BrandNode['kind'], parentBrandId: number | null): BrandNode {
  return { id, name, slug: name.toLowerCase(), kind, parentBrandId, isActive: true };
}

// Bose ─┬─ Wave ── Wave Radio
//       └─ SoundDock
// Sony
const TREE: BrandNode[] = [
  node(1, 'Bose', 'brand', null),
  node(2, 'Wave', 'product_line', 1),
  node(3, 'SoundDock', 'product_line', 1),
  node(4, 'Sony', 'brand', null),
  node(6, 'Wave Radio', 'product_line', 2),
];

function match(token: string, brandId: number): BrandTokenMatch {
  const n = TREE.find((b) => b.id === brandId)!;
  return { token, brandId, name: n.name, kind: n.kind, parentBrandId: n.parentBrandId, aliasSource: 'seed' };
}

interface Captured {
  statements: Array<{ orgId: OrgId; sql: string; params: unknown[] }>;
  treeLoads: number;
}

function fakes(opts: {
  matches?: BrandTokenMatch[];
  rows?: Array<Record<string, unknown>>;
}): { deps: BrandSearchDeps; cap: Captured } {
  const cap: Captured = { statements: [], treeLoads: 0 };
  const deps: BrandSearchDeps = {
    matchTokens: async () => opts.matches ?? [],
    loadTree: async () => {
      cap.treeLoads += 1;
      return TREE;
    },
    query: async <R,>(orgId: OrgId, sql: string, params: unknown[]) => {
      cap.statements.push({ orgId, sql, params });
      return { rows: (opts.rows ?? []) as R[] };
    },
  };
  return { deps, cap };
}

function docRow(entity_type: string, entity_id: number, brand_id: number) {
  return {
    entity_type,
    entity_id,
    title: `${entity_type} ${entity_id}`,
    subtitle: null,
    status: null,
    condition_grade: null,
    source_platform: null,
    tracking_number: null,
    carrier: null,
    serial_number: null,
    happened_at: '2026-09-01T00:00:00+00:00',
    brand_id,
    rank: 0,
  };
}

test('facet: a Wave (and Wave Radio) record counts under Bose; unknown brands are dropped', () => {
  const facet = rollupBrandFacet(TREE, [
    { brandId: 2, count: 3 },
    { brandId: 6, count: 1 },
    { brandId: 1, count: 2 },
    { brandId: 4, count: 5 },
    { brandId: 99, count: 40 },
  ]);
  assert.deepEqual(facet, [
    { id: 1, name: 'Bose', count: 6 },
    { id: 4, name: 'Sony', count: 5 },
  ]);
});

test('axis=brand: the brand filter expands to every descendant; leftover words rank, never filter', async () => {
  const { deps, cap } = fakes({
    matches: [match('bose', 1)],
    rows: [
      {
        rows: [docRow('SKU', 30, 2), docRow('ORDER', 31, 1)],
        facet: [
          { brand_id: 2, count: 4 },
          { brand_id: 1, count: 9 },
        ],
      },
    ],
  });
  const out = await searchByBrand(ORG, 'Bose soundlink', 20, deps);

  assert.equal(cap.statements.length, 1, 'one doc statement: page + facet together');
  const [stmt] = cap.statements;
  assert.equal(stmt.orgId, ORG);
  assert.equal(stmt.params[0], ORG, 'explicit organization_id filter, not just the GUC');
  assert.deepEqual(stmt.params[1], [1, 2, 3, 6], 'Bose + Wave + SoundDock + Wave Radio');
  assert.deepEqual(stmt.params[2], ['soundlink']);
  assert.equal(stmt.params[3], 20);

  assert.deepEqual(out.hits.map((h) => `${h.entityType}:${h.id}`), ['sku:30', 'order:31']);
  assert.ok(out.hits[0].score > out.hits[1].score, 'SQL page order survives the mapping');
  assert.deepEqual(out.facet, [{ id: 1, name: 'Bose', count: 13 }]);
});

test('axis=brand: naming a line under a brand narrows to that line ("bose wave" is Wave, not all of Bose)', async () => {
  const { deps, cap } = fakes({
    matches: [match('bose', 1), match('wave', 2)],
    rows: [{ rows: [], facet: [] }],
  });
  await searchByBrand(ORG, 'bose wave', 20, deps);
  assert.deepEqual(cap.statements[0].params[1], [2, 6]);
  assert.deepEqual(cap.statements[0].params[2], []);
});

test('axis=brand: unrelated brands both stay ("sony bose")', async () => {
  const { deps, cap } = fakes({
    matches: [match('sony', 4), match('bose', 1)],
    rows: [{ rows: [], facet: [] }],
  });
  await searchByBrand(ORG, 'sony bose', 20, deps);
  assert.deepEqual(cap.statements[0].params[1], [4, 1, 2, 3, 6]);
});

test('axis=brand: a query that names no brand never reaches the doc index', async () => {
  const { deps, cap } = fakes({ matches: [] });
  const out = await searchByBrand(ORG, 'broken box', 20, deps);
  assert.deepEqual(out, { hits: [], facet: [] });
  assert.equal(cap.statements.length, 0);
});

test('facet for a result list: only product-bearing records are looked up, by their doc types', async () => {
  const { deps, cap } = fakes({
    rows: [
      { brand_id: 2, n: 1 },
      { brand_id: 1, n: 1 },
    ],
  });
  const facet = await brandFacetForResults(
    ORG,
    [
      { entityType: 'order', id: 11 },
      { entityType: 'fba', id: 12 },
      { entityType: 'exception', id: 13 },
      { entityType: 'unit', id: 14 },
      { entityType: 'sku', id: 15 },
    ],
    deps,
  );
  assert.equal(cap.statements.length, 1);
  assert.deepEqual(cap.statements[0].params, [ORG, ['ORDER', 'SERIAL_UNIT', 'SKU'], [11, 14, 15]]);
  assert.deepEqual(facet, [{ id: 1, name: 'Bose', count: 2 }]);
});

test('facet for a result list with no product-bearing record costs no statement', async () => {
  const { deps, cap } = fakes({});
  const facet = await brandFacetForResults(
    ORG,
    [
      { entityType: 'repair', id: 1 },
      { entityType: 'import_exception', id: 2 },
    ],
    deps,
  );
  assert.deepEqual(facet, []);
  assert.equal(cap.statements.length, 0);
  assert.equal(cap.treeLoads, 0);
});
