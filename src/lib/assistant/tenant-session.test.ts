/** DB-free tests for the per-round tenant session: lazy checkout, mid-round release, commit/rollback. */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { createTenantSession, type TenantSessionDeps } from './tenant-session';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-1111-4111-8111-111111111111' as OrgId;
const OTHER = '22222222-2222-4222-8222-222222222222' as OrgId;

/** A fake pool: each checkout is a numbered connection; the log records what ran where. */
function fakePool(opts: { failConnect?: boolean } = {}) {
  const log: string[] = [];
  let next = 0;
  let open = 0;
  let peakOpen = 0;
  const deps: TenantSessionDeps = {
    withConnection: async (orgId, fn) => {
      if (opts.failConnect) throw new Error('timeout exceeded when trying to connect');
      const id = ++next;
      open += 1;
      peakOpen = Math.max(peakOpen, open);
      log.push(`c${id}:BEGIN ${orgId === ORG ? 'org' : 'other'}`);
      const client = {
        query: async (text: string) => {
          log.push(`c${id}:${text}`);
          return { rows: [{ text }] };
        },
      } as unknown as PoolClient;
      try {
        const out = await fn(client);
        log.push(`c${id}:COMMIT`);
        return out;
      } catch (err) {
        log.push(`c${id}:ROLLBACK`);
        throw err;
      } finally {
        open -= 1;
      }
    },
  };
  return { deps, log, peak: () => peakOpen, open: () => open };
}

test('a round whose tools never query checks out no connection', async () => {
  const pool = fakePool();
  const session = createTenantSession(ORG, pool.deps);
  const out = await session.runBatch(async () => 'ui tools only');
  assert.equal(out, 'ui tools only');
  assert.deepEqual(pool.log, []);
  assert.equal(session.stats().batches, 0);
});

test('every query in a round rides ONE connection, committed when the round ends', async () => {
  const pool = fakePool();
  const session = createTenantSession(ORG, pool.deps);
  await session.runBatch(async () => {
    await Promise.all([session.query(ORG, 'a'), session.query(ORG, 'b')]);
    await session.query(ORG, 'c');
  });
  assert.deepEqual(pool.log, ['c1:BEGIN org', 'c1:a', 'c1:b', 'c1:c', 'c1:COMMIT']);
  assert.deepEqual(session.stats(), { batches: 1, batched: 3, standalone: 0 });
  assert.equal(pool.open(), 0, 'nothing held after the round');
});

test('release() hands the client back mid-round; the next query opens a fresh one', async () => {
  const pool = fakePool();
  const session = createTenantSession(ORG, pool.deps);
  let heldDuringExternalCall = -1;
  await session.runBatch(async () => {
    await session.query(ORG, 'read order');
    await session.release();
    heldDuringExternalCall = pool.open(); // the carrier / ShipStation call happens here
    await session.query(ORG, 'read links');
  });
  assert.equal(heldDuringExternalCall, 0);
  assert.deepEqual(pool.log, [
    'c1:BEGIN org',
    'c1:read order',
    'c1:COMMIT',
    'c2:BEGIN org',
    'c2:read links',
    'c2:COMMIT',
  ]);
});

test('a round that throws rolls back and rethrows its own error', async () => {
  const pool = fakePool();
  const session = createTenantSession(ORG, pool.deps);
  await assert.rejects(
    session.runBatch(async () => {
      await session.query(ORG, 'write');
      throw new Error('tool blew up');
    }),
    /tool blew up/,
  );
  assert.deepEqual(pool.log, ['c1:BEGIN org', 'c1:write', 'c1:ROLLBACK']);
  assert.equal(pool.open(), 0);
});

test('a query for another org never rides the batch client', async () => {
  const pool = fakePool();
  const session = createTenantSession(ORG, pool.deps);
  await session.runBatch(async () => {
    await session.query(ORG, 'mine');
    await session.query(OTHER, 'theirs');
  });
  assert.ok(pool.log.includes('c2:BEGIN other'));
  assert.ok(pool.log.includes('c2:theirs'));
  assert.ok(!pool.log.includes('c1:theirs'));
  assert.deepEqual(session.stats(), { batches: 1, batched: 1, standalone: 1 });
});

test('outside a batch every query is standalone and holds nothing afterwards', async () => {
  const pool = fakePool();
  const session = createTenantSession(ORG, pool.deps);
  await session.query(ORG, 'x');
  assert.deepEqual(pool.log, ['c1:BEGIN org', 'c1:x', 'c1:COMMIT']);
  assert.equal(pool.open(), 0);
});

test('a pool checkout failure reaches the waiting query instead of hanging the round', async () => {
  const pool = fakePool({ failConnect: true });
  const session = createTenantSession(ORG, pool.deps);
  await assert.rejects(
    session.runBatch(() => session.query(ORG, 'x')),
    /timeout exceeded when trying to connect/,
  );
});

test('a nested batch shares the open connection', async () => {
  const pool = fakePool();
  const session = createTenantSession(ORG, pool.deps);
  await session.runBatch(async () => {
    await session.query(ORG, 'outer');
    await session.runBatch(() => session.query(ORG, 'inner'));
  });
  assert.equal(pool.peak(), 1);
  assert.deepEqual(session.stats().batches, 1);
});
