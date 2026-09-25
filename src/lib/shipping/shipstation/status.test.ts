import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ShipStationCredentials } from '@/lib/integrations/credentials';
import { createShipStationStatusChecker, type ShipStationStatusDeps } from './status';

/**
 * DB-free: credentials + both probes are injected fakes.
 * Run: npx tsx --test src/lib/shipping/shipstation/status.test.ts
 */

const ORG = 'org-a' as OrgId;
const FULL: ShipStationCredentials = { apiKey: 'v2', v1ApiKey: 'k1', v1ApiSecret: 's1' };

function httpError(status: number): Error & { httpStatus: number } {
  return Object.assign(new Error(`http ${status}`), { httpStatus: status });
}

function fakes(creds: ShipStationCredentials | null = FULL) {
  const cap = { v1: [] as Array<[string, string]>, v2: [] as string[], orgs: [] as OrgId[] };
  const state = {
    v1: null as Error | null,
    v2: null as Error | null,
    now: Date.parse('2026-09-24T12:00:00Z'),
  };
  const deps: ShipStationStatusDeps = {
    resolveCreds: async (orgId) => {
      cap.orgs.push(orgId);
      return creds;
    },
    probeV1: async (key, secret) => {
      cap.v1.push([key, secret]);
      if (state.v1) throw state.v1;
    },
    probeV2: async (key) => {
      cap.v2.push(key);
      if (state.v2) throw state.v2;
    },
    now: () => state.now,
  };
  return { checker: createShipStationStatusChecker(deps), cap, state };
}

test('both keys answer → active; each probe gets its own credential', async () => {
  const { checker, cap } = fakes();
  const s = await checker.check(ORG);
  assert.deepEqual(s, { v1: 'active', v2: 'active', active: true, checkedAt: '2026-09-24T12:00:00.000Z' });
  assert.deepEqual(cap.v1, [['k1', 's1']]);
  assert.deepEqual(cap.v2, ['v2']);
  assert.deepEqual(cap.orgs, [ORG]);
});

test('no v1 pair → v1 missing, not active, v1 never probed', async () => {
  const { checker, cap } = fakes({ apiKey: 'v2', v1ApiKey: 'k1' });
  const s = await checker.check(ORG);
  assert.equal(s.v1, 'missing');
  assert.equal(s.v2, 'active');
  assert.equal(s.active, false);
  assert.equal(cap.v1.length, 0);
});

test('no credentials at all → both missing', async () => {
  const { checker } = fakes(null);
  const s = await checker.check(ORG);
  assert.equal(s.v1, 'missing');
  assert.equal(s.v2, 'missing');
  assert.equal(s.active, false);
});

test('401 / 403 → rejected; 500 / network → error', async () => {
  const { checker, state } = fakes();
  state.v1 = httpError(401);
  state.v2 = httpError(403);
  let s = await checker.check(ORG);
  assert.equal(s.v1, 'rejected');
  assert.equal(s.v2, 'rejected');
  assert.equal(s.active, false);

  state.v1 = httpError(503);
  state.v2 = new Error('ECONNRESET');
  s = await checker.check(ORG, { fresh: true });
  assert.equal(s.v1, 'error');
  assert.equal(s.v2, 'error');
});

test('an error never flips a proven-active org off ShipStation', async () => {
  const { checker, state } = fakes();
  assert.equal((await checker.check(ORG)).active, true);
  state.v2 = httpError(502);
  const s = await checker.check(ORG, { fresh: true });
  assert.equal(s.v2, 'error');
  assert.equal(s.active, true);
});

test('an error never retires the sheet for a never-proven org', async () => {
  const { checker, state } = fakes();
  state.v1 = httpError(500);
  const s = await checker.check(ORG);
  assert.equal(s.v1, 'error');
  assert.equal(s.active, false);
});

test('a rejection after active does flip the org off', async () => {
  const { checker, state } = fakes();
  await checker.check(ORG);
  state.v1 = httpError(401);
  const s = await checker.check(ORG, { fresh: true });
  assert.equal(s.active, false);
});

test('cache: 5 min for a clean verdict, 30 s while a key errors', async () => {
  const { checker, cap, state } = fakes();
  await checker.check(ORG);
  state.now += 4 * 60_000;
  await checker.check(ORG);
  assert.equal(cap.v2.length, 1, 'served from cache inside 5 min');
  state.now += 2 * 60_000;
  state.v2 = httpError(500);
  await checker.check(ORG);
  assert.equal(cap.v2.length, 2, 're-probed after 5 min');
  state.now += 31_000;
  await checker.check(ORG);
  assert.equal(cap.v2.length, 3, 'error verdict expires after 30 s');
});

test('invalidate forgets both the cache and the sticky verdict', async () => {
  const { checker, state } = fakes();
  await checker.check(ORG);
  checker.invalidate(ORG);
  state.v2 = httpError(500);
  const s = await checker.check(ORG);
  assert.equal(s.active, false);
});

test('orgs are cached independently', async () => {
  const { checker, cap } = fakes();
  await checker.check(ORG);
  await checker.check('org-b' as OrgId);
  assert.deepEqual(cap.orgs, [ORG, 'org-b']);
});
