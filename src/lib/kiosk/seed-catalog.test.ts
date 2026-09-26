/** seedKioskCatalog — a seed must never be able to break the glass. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { KIOSK_SEED_PAGE_SIZE, seedKioskCatalog } from './seed-catalog';
import type { KioskCatalogWireProduct } from './catalog-request';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

const tile = (id: string): KioskCatalogWireProduct => ({
  id,
  name: `Bose ${id} Repair Service`,
  sku: `000${id}-RS`,
  price: 86,
  thumbnailUrl: `https://cdn.example/${id}.jpg`,
  enabled: true,
  inStock: true,
  categoryIds: [],
  availability: { onHand: 0, locations: [] } as never,
});

function fakes(over: Partial<Parameters<typeof seedKioskCatalog>[1]> = {}) {
  const calls: Array<{ orgId: OrgId; segment: string }> = [];
  const errors: unknown[] = [];
  return {
    calls,
    errors,
    deps: {
      resolveOrg: async () => ORG,
      readPage: async (orgId: OrgId, segment: 'service' | 'retail') => {
        calls.push({ orgId, segment });
        return [tile('1'), tile('2')];
      },
      onError: (e: unknown) => errors.push(e),
      ...over,
    },
  };
}

test('a paired tablet gets the first page, read for the segment it asked for', async () => {
  const { deps, calls } = fakes();
  const seed = await seedKioskCatalog('service', deps);
  assert.equal(seed?.products.length, 2);
  assert.equal(seed?.segment, 'service');
  assert.deepEqual(calls, [{ orgId: ORG, segment: 'service' }]);
});

test('an unpaired tablet seeds nothing and never reads the catalog', async () => {
  const { deps, calls } = fakes({ resolveOrg: async () => null });
  assert.equal(await seedKioskCatalog('service', deps), null);
  assert.deepEqual(calls, [], 'no org means no tenant-scoped read may be attempted');
});

test('an empty page is a null seed, not an empty grid handed to the client', async () => {
  // An empty array would let the picker paint "no products" from a snapshot
  // that may just be a cold projection; null hands the question to the fetch.
  const { deps } = fakes({ readPage: async () => [] });
  assert.equal(await seedKioskCatalog('service', deps), null);
});

test('a throwing read degrades to null and reports — it never propagates', async () => {
  const boom = new Error('projection unavailable');
  const { deps, errors } = fakes({
    readPage: async () => {
      throw boom;
    },
  });
  assert.equal(await seedKioskCatalog('service', deps), null);
  assert.deepEqual(errors, [boom]);
});

test('a throwing cookie/device resolve degrades the same way', async () => {
  const { deps, errors } = fakes({
    resolveOrg: async () => {
      throw new Error('no request scope');
    },
  });
  assert.equal(await seedKioskCatalog('retail', deps), null);
  assert.equal(errors.length, 1);
});

/** The bug this pins SHIPPED, briefly, and every local check passed. */
test('Next\u2019s dynamic-usage signal escapes the catch — it is control flow, not a failure', async () => {
  const dynamicUsage = Object.assign(new Error('Dynamic server usage: cookies'), {
    digest: 'DYNAMIC_SERVER_USAGE',
  });
  const { deps, errors } = fakes({
    resolveOrg: async () => {
      throw dynamicUsage;
    },
  });
  await assert.rejects(() => seedKioskCatalog('service', deps), /Dynamic server usage/);
  assert.deepEqual(errors, [], 'a framework signal is not a seed failure to report');
});

test('a digest that merely looks similar is still a normal failure', async () => {
  const { deps, errors } = fakes({
    readPage: async () => {
      throw Object.assign(new Error('nope'), { digest: 'NEXT_REDIRECT' });
    },
  });
  assert.equal(await seedKioskCatalog('service', deps), null);
  assert.equal(errors.length, 1);
});

test('the seed covers the fold without paying for the whole page size', () => {
  // 24 is the grid's fetch page; the seed is HTML on the critical path, so it
  // carries one screen and lets the client's fetch bring the rest.
  assert.ok(KIOSK_SEED_PAGE_SIZE > 0 && KIOSK_SEED_PAGE_SIZE < 24);
});
