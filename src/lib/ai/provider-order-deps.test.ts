/** DB-free unit tests for the memoized per-org AI provider order (A9). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderOrderResolver, type ProviderOrderResolverDeps } from './provider-order-deps';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;
const OTHER = '00000000-0000-4000-8000-000000000002' as OrgId;

/** A settings row the test can rewrite, a Redis stand-in keyed like getOrSet, and a clock. */
function harness(initial: Record<string, string | null>) {
  const db = { ...initial };
  const loads: string[] = [];
  const shared = new Map<string, unknown>();
  let t = 1_000;
  const deps: ProviderOrderResolverDeps = {
    load: async (orgId) => {
      loads.push(orgId);
      return db[orgId] ?? null;
    },
    getOrSet: (async (namespace: string, orgId: string, key: string, _ttl: number, _tags: string[], loader: () => Promise<unknown>) => {
      const k = `${namespace}:${orgId}:${key}`;
      if (!shared.has(k)) shared.set(k, await loader());
      return shared.get(k);
    }) as ProviderOrderResolverDeps['getOrSet'],
    invalidate: async (orgId) => {
      for (const k of [...shared.keys()]) if (k.includes(`:${orgId}:`)) shared.delete(k);
    },
    now: () => t,
  };
  return { db, loads, shared, deps, advance: (ms: number) => (t += ms) };
}

test('repeated resolves read the DB once per org', async () => {
  const h = harness({ [ORG]: 'cloud', [OTHER]: 'local' });
  const r = createProviderOrderResolver(h.deps);

  for (let i = 0; i < 50; i++) assert.equal(await r.resolve(ORG), 'cloud-first');
  assert.equal(await r.resolve(OTHER), 'local-first');

  assert.deepEqual(h.loads, [ORG, OTHER]);
});

test('invalidate forces a re-read, so a settings change is visible on the next call', async () => {
  const h = harness({ [ORG]: 'cloud' });
  const r = createProviderOrderResolver(h.deps);
  assert.equal(await r.resolve(ORG), 'cloud-first');

  h.db[ORG] = 'local';
  assert.equal(await r.resolve(ORG), 'cloud-first', 'still memoized before invalidation');

  await r.invalidate(ORG);
  assert.equal(await r.resolve(ORG), 'local-first');
  assert.equal(h.loads.length, 2);
});

test('another instance converges once its local memo expires (shared cache was invalidated)', async () => {
  const h = harness({ [ORG]: 'cloud' });
  const writer = createProviderOrderResolver(h.deps);
  const reader = createProviderOrderResolver(h.deps);
  assert.equal(await reader.resolve(ORG), 'cloud-first');

  h.db[ORG] = 'local';
  await writer.invalidate(ORG);
  assert.equal(await reader.resolve(ORG), 'cloud-first', 'reader memo is still fresh');

  h.advance(30_000);
  assert.equal(await reader.resolve(ORG), 'local-first');
});

test('an unreadable preference is NOT memoized — the next call retries', async () => {
  const h = harness({ [ORG]: 'cloud' });
  let fail = true;
  const load = h.deps.load;
  const r = createProviderOrderResolver({
    ...h.deps,
    load: async (orgId) => {
      if (fail) throw new Error('db down');
      return load(orgId);
    },
  });

  await r.resolve(ORG);
  fail = false;
  assert.equal(await r.resolve(ORG), 'cloud-first');
});
