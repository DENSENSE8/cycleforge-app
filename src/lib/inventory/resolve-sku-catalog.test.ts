/** Guards for the §6 single guarded pairing function (sku-reconciliation plan). */

import { test, before } from 'node:test';
import { equal, deepEqual } from 'node:assert';
import type * as ResolveSkuCatalogModule from './resolve-sku-catalog';
import type { ResolvedSkuCatalog, ResolveSkuCatalogDeps } from './resolve-sku-catalog';

// The module transitively imports `@/lib/neon-client`, which throws at load when NODE_ENV !== 'test' and DATABASE_URL is unset (the CI…
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
let resolveSkuCatalogRow: typeof ResolveSkuCatalogModule.resolveSkuCatalogRow;
let strippableVariantBase: typeof ResolveSkuCatalogModule.strippableVariantBase;
let pickSkuCatalogMatch: typeof ResolveSkuCatalogModule.pickSkuCatalogMatch;
// Dynamic on purpose: NODE_ENV must be set before neon-client loads (see above).
before(async () => {
  ({ resolveSkuCatalogRow, strippableVariantBase, pickSkuCatalogMatch } = await import('./resolve-sku-catalog'));
});

function row(id: number, sku: string): ResolvedSkuCatalog {
  return { id, sku, product_title: `Product ${sku}`, gtin: null };
}

/**
 * Stand-in for PostgreSQL `fn_normalize_sku` inside the fake catalog query:
 * trim, upper, pad a short leading numeric base to 5, keep the suffix.
 */
function dbKey(sku: string): string {
  const s = sku.trim().toUpperCase();
  const m = /^([0-9]+)(.*)$/.exec(s);
  return m ? m[1].padStart(5, '0') + m[2] : s;
}

/**
 * Deps backed by a fixed catalog, answering `candidates` the way the SQL does:
 * rows sharing the canonical key, exact first, at most two.
 */
function fakes(catalog: ResolvedSkuCatalog[], byId: Record<number, ResolvedSkuCatalog> = {}) {
  const queued: string[] = [];
  const calls: string[] = [];
  const deps: ResolveSkuCatalogDeps = {
    async byId(id) {
      calls.push(`byId:${id}`);
      return byId[id] ?? null;
    },
    async candidates(sku) {
      calls.push(`candidates:${sku}`);
      return catalog
        .filter((r) => dbKey(r.sku) === dbKey(sku))
        .map((r) => ({ ...r, exact: r.sku.toUpperCase() === sku.trim().toUpperCase() }))
        .sort((a, b) => Number(b.exact) - Number(a.exact) || a.id - b.id)
        .slice(0, 2);
    },
    async crosswalk(sku) {
      calls.push(`crosswalk:${sku}`);
      return null;
    },
    async queue(rawSku) {
      queued.push(rawSku);
    },
  };
  return { deps, queued, calls };
}

// ─── strippableVariantBase boundaries ────────────────────────────────────────

test('strippableVariantBase strips a pure NNNN-N counter suffix', () => {
  equal(strippableVariantBase('00010-2'), '00010');
  equal(strippableVariantBase('1234-5'), '1234');
  equal(strippableVariantBase('012880-14'), '012880');
});

test('strippableVariantBase never strips a protected -P-N part index', () => {
  equal(strippableVariantBase('00072-P-1'), null);
  equal(strippableVariantBase('00046-P-17'), null);
});

test('strippableVariantBase never strips a non-numeric (color/condition) suffix', () => {
  equal(strippableVariantBase('00010-B'), null);
  equal(strippableVariantBase('00010-WH'), null);
  equal(strippableVariantBase('00010-SW'), null);
});

test('strippableVariantBase ignores bare bases and sub-4-digit bases', () => {
  equal(strippableVariantBase('00010'), null); // no dash
  equal(strippableVariantBase('123-5'), null); // base < 4 digits
  equal(strippableVariantBase(''), null);
  equal(strippableVariantBase('   '), null);
});

// ─── pickSkuCatalogMatch: the ambiguity guard ────────────────────────────────

test('pickSkuCatalogMatch: an exact hit beats a padding twin', () => {
  const picked = pickSkuCatalogMatch([
    { sku: '36', exact: true },
    { sku: '00036', exact: false },
  ]);
  deepEqual(picked, { kind: 'match', row: { sku: '36', exact: true } });
});

test('pickSkuCatalogMatch: one padding twin is the product, two are ambiguous', () => {
  deepEqual(pickSkuCatalogMatch([{ sku: '00089-P-1', exact: false }]), {
    kind: 'match',
    row: { sku: '00089-P-1', exact: false },
  });
  deepEqual(
    pickSkuCatalogMatch([
      { sku: '00036', exact: false },
      { sku: '36', exact: false },
    ]),
    { kind: 'ambiguous', skus: ['00036', '36'] },
  );
  deepEqual(pickSkuCatalogMatch([]), { kind: 'none' });
});

// ─── resolveSkuCatalogRow: exact / explicit win before any strip ─────────────

test('exact match wins — never strips, never queues', async () => {
  const { deps, queued } = fakes([row(7, '00010-2'), row(1, '00010')]);
  const res = await resolveSkuCatalogRow('00010-2', null, undefined, deps);
  equal(res?.id, 7);
  deepEqual(queued, []);
});

test('explicit id wins with the stored SKU — no string lookup runs', async () => {
  const { deps, queued, calls } = fakes([], { 348: row(348, '00089-P-1') });
  const res = await resolveSkuCatalogRow('00089-P-1', 348, undefined, deps);
  equal(res?.id, 348);
  deepEqual(calls, ['byId:348']);
  deepEqual(queued, []);
});

test('explicit id miss does NOT strip (explicit short-circuits the string chain)', async () => {
  const { deps, calls } = fakes([row(1, '00010')]);
  const res = await resolveSkuCatalogRow('00010-2', 999, undefined, deps);
  equal(res, null);
  deepEqual(calls, ['byId:999']);
});

// ─── resolveSkuCatalogRow: canonical padding, both directions ────────────────

test('a zero-stripped SKU resolves to its padded catalog row and does not queue', async () => {
  const { deps, queued } = fakes([row(347, '00089'), row(348, '00089-P-1'), row(622, '00189-P-1')]);
  const res = await resolveSkuCatalogRow('89-P-1', null, undefined, deps);
  equal(res?.id, 348);
  equal(res?.sku, '00089-P-1');
  equal((await resolveSkuCatalogRow('189-P-1', null, undefined, deps))?.id, 622);
  equal((await resolveSkuCatalogRow('00189-P-1', null, undefined, deps))?.id, 622);
  deepEqual(queued, [], 'a padding variant of an existing SKU is not a new product');
});

test('a padded SKU resolves to an unpadded catalog row', async () => {
  const { deps, queued } = fakes([row(1902, '1103:B95'), row(3574, '01103')]);
  equal((await resolveSkuCatalogRow('01103:B95', null, undefined, deps))?.id, 1902);
  deepEqual(queued, []);
});

test('an ambiguous padding names no product — null, and nothing is queued', async () => {
  const { deps, queued } = fakes([row(166, '00036'), row(1115, '36')]);
  equal(await resolveSkuCatalogRow('036', null, undefined, deps), null);
  deepEqual(queued, [], 'the products exist; the input is ambiguous, not missing');
  equal((await resolveSkuCatalogRow('36', null, undefined, deps))?.id, 1115);
  equal((await resolveSkuCatalogRow('00036', null, undefined, deps))?.id, 166);
});

test('canonical padding never merges a part into its parent', async () => {
  const { deps, queued } = fakes([row(347, '00089')]);
  equal(await resolveSkuCatalogRow('89-P-1', null, undefined, deps), null);
  deepEqual(queued, ['89-P-1']);
});

// ─── resolveSkuCatalogRow: the guarded strip ─────────────────────────────────

test('strips NNNN-N to its base when the suffixed form misses but the base hits', async () => {
  const { deps, queued } = fakes([row(1, '00010')]);
  const res = await resolveSkuCatalogRow('00010-2', null, undefined, deps);
  equal(res?.id, 1, 'resolves via the stripped base');
  deepEqual(queued, [], 'a successful strip does not queue');
});

test('does NOT strip a -P-N part index — misses and queues the original', async () => {
  // base "00072" exists, but -P-1 is a distinct physical component: must NOT collapse.
  const { deps, queued } = fakes([row(2, '00072')]);
  const res = await resolveSkuCatalogRow('00072-P-1', null, undefined, deps);
  equal(res, null, 'never resolves a part index to its base');
  deepEqual(queued, ['00072-P-1'], 'unresolved → queued verbatim');
});

test('does NOT strip a non-numeric suffix — misses and queues the original', async () => {
  const { deps, queued } = fakes([row(1, '00010')]);
  const res = await resolveSkuCatalogRow('00010-B', null, undefined, deps);
  equal(res, null, 'color/condition variant never collapses to the base');
  deepEqual(queued, ['00010-B']);
});

// ─── resolveSkuCatalogRow: queue-on-miss ─────────────────────────────────────

test('total miss queues the raw SKU and returns null', async () => {
  const { deps, queued } = fakes([]);
  const res = await resolveSkuCatalogRow('  99999  ', null, undefined, deps);
  equal(res, null);
  deepEqual(queued, ['99999'], 'queues the trimmed raw SKU');
});

test('empty input neither resolves nor queues', async () => {
  const { deps, queued } = fakes([]);
  const res = await resolveSkuCatalogRow('   ', null, undefined, deps);
  equal(res, null);
  deepEqual(queued, []);
});
