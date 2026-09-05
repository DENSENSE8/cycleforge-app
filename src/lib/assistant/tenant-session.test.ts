/**
 * DB-free tests for the per-round tenant session (Ask plan §22 H1).
 * Run: npm run test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { createTenantSession, type TenantSessionDeps } from './tenant-session';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;
const OTHER = '99999999-9999-9999-9999-999999999999' as OrgId;

function fakes() {
  const cap = {
    /** One entry per connection checkout: the org its GUC was set to. */
    connections: [] as OrgId[],
    /** Queries that rode a batch client. */
    onClient: [] as string[],
    /** Queries that opened their own tenantQuery connection. */
    standalone: [] as Array<{ orgId: string; text: string }>,
    open: 0,
    maxOpen: 0,
  };
  const deps: TenantSessionDeps = {
    withConnection: (async (orgId, fn) => {
      cap.connections.push(orgId as OrgId);
      cap.open += 1;
      cap.maxOpen = Math.max(cap.maxOpen, cap.open);
      const client = {
        query: async (text: string) => {
          cap.onClient.push(text);
          return { rows: [{ from: 'client' }] };
        },
      } as unknown as PoolClient;
      try {
        return await fn(client);
      } finally {
        cap.open -= 1;
      }
    }) as TenantSessionDeps['withConnection'],
    query: (async (orgId: string, text: string) => {
      cap.standalone.push({ orgId, text });
      return { rows: [{ from: 'tenantQuery' }] };
    }) as unknown as TenantSessionDeps['query'],
  };
  return { deps, cap };
}

test('outside a batch the session is plain tenantQuery', async () => {
  const { deps, cap } = fakes();
  const session = createTenantSession(ORG, deps);
  const out = await session.query(ORG, 'SELECT 1');
  assert.deepEqual(out.rows, [{ from: 'tenantQuery' }]);
  assert.equal(cap.connections.length, 0, 'no batch was opened');
  assert.deepEqual(session.stats(), { batches: 0, batched: 0, standalone: 1 });
});

test('inside one batch, three reads share ONE connection and one BEGIN/COMMIT', async () => {
  const { deps, cap } = fakes();
  const session = createTenantSession(ORG, deps);
  await session.runBatch(async () => {
    await session.query(ORG, 'SELECT a');
    await session.query(ORG, 'SELECT b');
    await session.query(ORG, 'SELECT c');
  });
  assert.deepEqual(cap.connections, [ORG]);
  assert.deepEqual(cap.onClient, ['SELECT a', 'SELECT b', 'SELECT c']);
  assert.equal(cap.standalone.length, 0);
  assert.deepEqual(session.stats(), { batches: 1, batched: 3, standalone: 0 });
});

test('the connection is released between batches — nothing is held across model rounds', async () => {
  const { deps, cap } = fakes();
  const session = createTenantSession(ORG, deps);
  await session.runBatch(() => session.query(ORG, 'round 1'));
  assert.equal(cap.open, 0, 'batch 1 released');
  // Between rounds the session holds nothing: a query here opens its own.
  await session.query(ORG, 'between rounds');
  await session.runBatch(() => session.query(ORG, 'round 2'));
  assert.equal(cap.open, 0, 'batch 2 released');
  assert.equal(cap.maxOpen, 1, 'never more than one connection at a time');
  assert.deepEqual(cap.connections, [ORG, ORG]);
  assert.deepEqual(cap.standalone.map((s) => s.text), ['between rounds']);
});

test('a query for another org never rides this org\'s connection', async () => {
  const { deps, cap } = fakes();
  const session = createTenantSession(ORG, deps);
  await session.runBatch(async () => {
    await session.query(ORG, 'mine');
    await session.query(OTHER, 'theirs');
  });
  assert.deepEqual(cap.onClient, ['mine'], 'only this org rode the batch client');
  assert.deepEqual(cap.standalone, [{ orgId: OTHER, text: 'theirs' }], 'the other org got its own GUC');
});

test('nested batches reuse the open client instead of opening a second transaction', async () => {
  const { deps, cap } = fakes();
  const session = createTenantSession(ORG, deps);
  await session.runBatch(async () => {
    await session.query(ORG, 'outer');
    await session.runBatch(() => session.query(ORG, 'inner'));
    await session.query(ORG, 'outer again');
  });
  assert.equal(cap.connections.length, 1, 'one checkout for both levels');
  assert.deepEqual(cap.onClient, ['outer', 'inner', 'outer again']);
  assert.equal(cap.maxOpen, 1);
});

test('a throwing batch releases the client and propagates — later queries still work', async () => {
  const { deps, cap } = fakes();
  const session = createTenantSession(ORG, deps);
  await assert.rejects(
    session.runBatch(async () => {
      await session.query(ORG, 'before the throw');
      throw new Error('tool exploded');
    }),
    /tool exploded/,
  );
  assert.equal(cap.open, 0, 'released despite the throw');
  const after = await session.query(ORG, 'after');
  assert.deepEqual(after.rows, [{ from: 'tenantQuery' }], 'session is not wedged');
});
