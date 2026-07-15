import test from 'node:test';
import assert from 'node:assert/strict';

import { invalidateDomainViews, type ViewInvalidationDeps } from './view-invalidation';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { invalidateFbaViews } from '@/lib/fba/invalidation';
import { invalidateTechViews } from '@/lib/tech/invalidation';

const ORG = '11111111-1111-1111-1111-111111111111';

/** Capturing fake for the two invalidation seams — records the exact tuples fired. */
function fakeDeps() {
  const legacy: string[][] = [];
  const org: Array<{ orgId: string; tags: string[] }> = [];
  const deps: ViewInvalidationDeps = {
    invalidateLegacy: async (tags) => {
      legacy.push(tags);
    },
    invalidateOrg: async (orgId, tags) => {
      org.push({ orgId, tags });
    },
  };
  return { deps, legacy, org };
}

test('invalidateDomainViews: fires legacy then org-scoped, extraTags merged into both, deduped', async () => {
  const { deps, legacy, org } = fakeDeps();

  // extraTag 'b' is present in both base lists → deduped out of each independently.
  await invalidateDomainViews(ORG, ['a', 'b'], ['b', 'c'], ['b', 'x'], deps);

  assert.equal(legacy.length, 1, 'one legacy call');
  assert.deepEqual(legacy[0], ['a', 'b', 'x'], 'legacy = legacyTags + extraTags, deduped');
  assert.equal(org.length, 1, 'one org-scoped call');
  assert.equal(org[0].orgId, ORG);
  assert.deepEqual(org[0].tags, ['b', 'c', 'x'], 'v2 = v2Tags + extraTags, deduped');
});

test('invalidateDomainViews: no org id → legacy only, org branch skipped', async () => {
  const { deps, legacy, org } = fakeDeps();

  await invalidateDomainViews(null, ['a'], ['b'], [], deps);

  assert.deepEqual(legacy[0], ['a']);
  assert.equal(org.length, 0, 'session-less caller still busts the legacy snapshot, no org call');
});

test('invalidateDomainViews: empty legacy list skips the legacy call', async () => {
  const { deps, legacy, org } = fakeDeps();

  await invalidateDomainViews(ORG, [], ['b'], [], deps);

  assert.equal(legacy.length, 0, 'no legacy tags → no legacy call');
  assert.deepEqual(org[0].tags, ['b']);
});

test('invalidateReceivingViews: dual-fires the receiving tag set', async () => {
  const { deps, legacy, org } = fakeDeps();

  await invalidateReceivingViews(ORG, [], deps);

  assert.deepEqual(legacy[0], ['receiving-logs', 'receiving-lines', 'pending-unboxing']);
  assert.deepEqual(org[0].tags, ['receiving-lines', 'receiving-logs', 'pending-unboxing']);
});

test('invalidateFbaViews: dual-fires board/today/stage-counts', async () => {
  const { deps, legacy, org } = fakeDeps();

  await invalidateFbaViews(ORG, [], deps);

  assert.deepEqual(legacy[0], ['fba-board', 'fba-today', 'fba-stage-counts']);
  assert.deepEqual(org[0].tags, ['fba-board', 'fba-today', 'fba-stage-counts']);
});

test('invalidateTechViews: v2 set includes order-detail (the audited staleness fix)', async () => {
  const { deps, legacy, org } = fakeDeps();

  await invalidateTechViews(ORG, [], deps);

  assert.deepEqual(legacy[0], ['tech-logs', 'orders-next']);
  assert.deepEqual(org[0].tags, ['tech-logs', 'orders-next', 'orders', 'order-detail']);
  assert.ok(org[0].tags.includes('order-detail'), 'tech writes must bust the org-scoped order-detail read');
});
