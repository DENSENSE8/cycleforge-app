import test from 'node:test';
import assert from 'node:assert/strict';
import { brandsForSkus, matchBrandTokens, sqlSkuBrandJson } from './lookup';
import type { BrandQueryDeps } from './tree';
import { brandRoot, brandSubtreeIds, type BrandNode } from './tree';

const ORG = '00000000-0000-0000-0000-000000000001';

/** Fake runner: answers from an alias table, recording each statement's org + params. */
function aliasDeps(aliasRows: Array<{ normalized_alias: string; id: number; name: string; kind: string; parent_brand_id: number | null }>) {
  const calls: Array<{ orgId: string; params: unknown[] }> = [];
  const deps: BrandQueryDeps = {
    query: async (orgId, _sql, params) => {
      calls.push({ orgId, params });
      const wanted = params[1] as string[];
      return { rows: aliasRows.filter((r) => wanted.includes(r.normalized_alias)).map((r) => ({ ...r, source: 'seed' })) as never[] };
    },
  };
  return { deps, calls };
}

const ALIAS_ROWS = [
  { normalized_alias: 'guitar hero', id: 4, name: 'Guitar Hero', kind: 'franchise', parent_brand_id: null },
  { normalized_alias: 'bose', id: 1, name: 'Bose', kind: 'brand', parent_brand_id: null },
  { normalized_alias: 'bose wave', id: 2, name: 'Wave', kind: 'product_line', parent_brand_id: 1 },
  { normalized_alias: 'jbl', id: 3, name: 'JBL', kind: 'brand', parent_brand_id: null },
];

test('matchBrandTokens: one org-scoped statement; longest hit per position consumes its tokens', async () => {
  const { deps, calls } = aliasDeps(ALIAS_ROWS);
  const hits = await matchBrandTokens(ORG, ['Guitar', 'Hero', 'drums', 'BOSE', 'wave', 'used'], deps);
  assert.deepEqual(hits.map((h) => [h.token, h.brandId]), [['guitar hero', 4], ['bose wave', 2]]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.orgId, ORG);
  assert.equal(calls[0]!.params[0], ORG);
});

test('matchBrandTokens: raw multi-word tokens are split and normalised ("jbl flip" pasted as one token)', async () => {
  const { deps } = aliasDeps(ALIAS_ROWS);
  const hits = await matchBrandTokens(ORG, ['JBL Flip 5'], deps);
  assert.deepEqual(hits.map((h) => h.name), ['JBL']);
});

test('matchBrandTokens: no usable tokens → no query at all', async () => {
  const { deps, calls } = aliasDeps(ALIAS_ROWS);
  assert.deepEqual(await matchBrandTokens(ORG, ['  ', '***'], deps), []);
  assert.equal(calls.length, 0);
});

test('brandsForSkus: one statement for the batch, empty input costs nothing, root carried', async () => {
  const calls: unknown[][] = [];
  const deps: BrandQueryDeps = {
    query: async (_org, _sql, params) => {
      calls.push(params);
      return {
        rows: [
          { sku: '00041', brand: { id: 2, name: 'Wave', kind: 'product_line', confidence: 0.9, source: 'product_line', root: { id: 1, name: 'Bose' } } },
          { sku: '00099', brand: null },
        ] as never[],
      };
    },
  };
  assert.equal((await brandsForSkus(ORG, [], deps)).size, 0);
  assert.equal(calls.length, 0);
  const out = await brandsForSkus(ORG, ['00041', ' 00041 ', '00099'], deps);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [ORG, ['00041', '00099']]);
  assert.deepEqual(out.get('00041'), { id: 2, name: 'Wave', kind: 'product_line', confidence: 0.9, source: 'product_line', root: { id: 1, name: 'Bose' } });
  assert.equal(out.has('00099'), false, 'a SKU without a brand fact is absent, not null-branded');
});

test('sqlSkuBrandJson refuses anything but a bare SQL alias (it is interpolated)', () => {
  assert.throws(() => sqlSkuBrandJson('sc; DROP TABLE x'));
  assert.doesNotThrow(() => sqlSkuBrandJson('sc2'));
});

test('tree: subtree includes every descendant; root walks to the top', () => {
  const nodes: BrandNode[] = [
    { id: 1, name: 'Bose', slug: 'bose', kind: 'brand', parentBrandId: null, isActive: true },
    { id: 2, name: 'Wave', slug: 'wave', kind: 'product_line', parentBrandId: 1, isActive: true },
    { id: 5, name: 'Wave II', slug: 'wave-ii', kind: 'product_line', parentBrandId: 2, isActive: true },
    { id: 3, name: 'Sony', slug: 'sony', kind: 'brand', parentBrandId: null, isActive: true },
  ];
  assert.deepEqual(brandSubtreeIds(nodes, [1]).sort(), [1, 2, 5]);
  assert.deepEqual(brandSubtreeIds(nodes, [3, 3]), [3]);
  assert.equal(brandRoot(nodes, 5)?.name, 'Bose');
  assert.equal(brandRoot(nodes, 99), null);
});
