import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectEcwidCatalog,
  type EcwidProjectionDeps,
  type EcwidProjectionResult,
} from './sync';
import type { EcwidCategory, EcwidProduct } from '@/lib/repair/ecwid-repair-catalog';
import type {
  ProjectedCategoryInput,
  ProjectedListingInput,
} from '@/lib/repair/catalog-projection';

const ORG = '00000000-0000-0000-0000-000000000002';

function product(patch: Partial<EcwidProduct> = {}): EcwidProduct {
  return {
    id: 'P1',
    name: 'QC35 Repair',
    sku: '00958-RS',
    price: 130,
    thumbnailUrl: null,
    enabled: true,
    inStock: true,
    categoryIds: ['C1'],
    ...patch,
  };
}

interface FakeOpts {
  creds?: { storeId: string; apiToken: string } | null;
  products?: EcwidProduct[];
  categories?: EcwidCategory[];
  fetchThrows?: Error;
  writeThrows?: Error;
}

function fakes(opts: FakeOpts = {}) {
  const calls = {
    written: [] as Array<{
      listings: ProjectedListingInput[];
      categories: ProjectedCategoryInput[];
    }>,
    fetches: 0,
  };
  let clock = 1000;

  const deps: EcwidProjectionDeps = {
    async resolveCreds() {
      return opts.creds === undefined ? { storeId: 'S1', apiToken: 'T1' } : opts.creds;
    },
    async fetchCategories() {
      calls.fetches += 1;
      if (opts.fetchThrows) throw opts.fetchThrows;
      return opts.categories ?? [{ id: 'C1', parentId: null, name: 'Bose Repair Service' }];
    },
    async fetchProducts() {
      if (opts.fetchThrows) throw opts.fetchThrows;
      return opts.products ?? [product()];
    },
    async write(_orgId, listings, categories) {
      if (opts.writeThrows) throw opts.writeThrows;
      calls.written.push({ listings, categories });
      return {
        listingsUpserted: listings.length,
        categoriesUpserted: categories.length,
        listingsDeactivated: 2,
        categoriesDeactivated: 1,
      };
    },
    now: () => (clock += 25),
  };

  return { deps, calls };
}

test('a healthy run projects listings and categories and reports counts', async () => {
  const { deps, calls } = fakes({
    products: [product({ id: 'P1' }), product({ id: 'P2', name: 'Cable' })],
    categories: [
      { id: 'C1', parentId: null, name: 'Bose Repair Service' },
      { id: 'C2', parentId: 'C1', name: 'Headphones' },
    ],
  });

  const res: EcwidProjectionResult = await projectEcwidCatalog(ORG, deps);

  assert.equal(res.ok, true);
  assert.equal(res.listingsSeen, 2);
  assert.equal(res.categoriesSeen, 2);
  assert.equal(res.listingsUpserted, 2);
  assert.equal(res.categoriesUpserted, 2);
  assert.equal(res.listingsDeactivated, 2);
  assert.equal(res.categoriesDeactivated, 1);
  assert.ok(res.fetchMs >= 0 && res.writeMs >= 0, 'timings are reported');
  assert.equal(calls.written.length, 1, 'one batched write, not one per row');
});

test('prices are converted to minor units on the way in', async () => {
  const { deps, calls } = fakes({ products: [product({ price: 19.99 })] });
  await projectEcwidCatalog(ORG, deps);
  assert.equal(calls.written[0].listings[0].listingPriceCents, 1999);
});

test('the category tree arrives with depth and full_path precomputed', async () => {
  const { deps, calls } = fakes({
    categories: [
      { id: 'C1', parentId: null, name: 'Root' },
      { id: 'C2', parentId: 'C1', name: 'Child' },
    ],
  });
  await projectEcwidCatalog(ORG, deps);
  const child = calls.written[0].categories.find((c) => c.externalId === 'C2');
  assert.equal(child?.depth, 1);
  assert.equal(child?.fullPath, 'Root > Child');
});

test('no connected provider is a soft error — nothing is written', async () => {
  const { deps, calls } = fakes({ creds: null });

  const res = await projectEcwidCatalog(ORG, deps);

  assert.equal(res.ok, false);
  assert.match(String(res.error), /No catalog provider connected/);
  assert.deepEqual(calls.written, []);
});

test('an EMPTY provider response leaves the previous projection untouched', async () => {
  // Deactivating every row on an empty read is indistinguishable from a real
  // empty storefront at the DB layer, and the failure mode is a blank picker.
  const { deps, calls } = fakes({ products: [], categories: [] });

  const res = await projectEcwidCatalog(ORG, deps);

  assert.equal(res.ok, false);
  assert.match(String(res.error), /empty catalog/i);
  assert.deepEqual(calls.written, [], 'no write at all — not even a deactivation sweep');
});

test('a vendor failure NEVER throws and never wipes the projection', async () => {
  const { deps, calls } = fakes({ fetchThrows: new Error('ecwid 503') });

  const res = await projectEcwidCatalog(ORG, deps);

  assert.equal(res.ok, false);
  assert.equal(res.error, 'ecwid 503');
  assert.deepEqual(calls.written, []);
});

test('a write failure is reported as a soft error, not a throw', async () => {
  // This runs from a cron and a settings button; a throw would surface as a 500
  // on a surface whose whole job is "refresh in the background".
  const { deps } = fakes({ writeThrows: new Error('deadlock detected') });

  const res = await projectEcwidCatalog(ORG, deps);

  assert.equal(res.ok, false);
  assert.equal(res.error, 'deadlock detected');
});

test('a catalog with categories but no products still projects the tree', async () => {
  // An empty-but-structured storefront is legitimate, and the picker needs the
  // tree to render its branches.
  const { deps, calls } = fakes({
    products: [],
    categories: [{ id: 'C1', parentId: null, name: 'Bose Repair Service' }],
  });

  const res = await projectEcwidCatalog(ORG, deps);

  assert.equal(res.ok, true);
  assert.equal(res.categoriesUpserted, 1);
  assert.equal(res.listingsUpserted, 0);
  assert.equal(calls.written[0].listings.length, 0);
});

test('the org under projection is the one passed in', async () => {
  const seen: string[] = [];
  const { deps } = fakes();
  const wrapped: EcwidProjectionDeps = {
    ...deps,
    async write(orgId, listings, categories) {
      seen.push(orgId);
      return deps.write(orgId, listings, categories);
    },
  };
  await projectEcwidCatalog(ORG, wrapped);
  assert.deepEqual(seen, [ORG]);
});
