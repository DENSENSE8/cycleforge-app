/**
 * acknowledgeUnbox: set-once carton "Unboxed" stamp from an operator action.
 *   tsx --test src/lib/receiving/acknowledge-unbox.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeUnbox, type AcknowledgeUnboxDeps } from './acknowledge-unbox';

type Call = { orgId: string; receivingId: number; patch: Record<string, unknown> };

function fakeDeps(): { deps: AcknowledgeUnboxDeps; calls: Call[] } {
  const calls: Call[] = [];
  const deps = {
    upsertUnbox: (async (_client, orgId, receivingId, patch) => {
      calls.push({ orgId, receivingId, patch: patch as Record<string, unknown> });
    }) as AcknowledgeUnboxDeps['upsertUnbox'],
  };
  return { deps, calls };
}

const client = { query: async () => ({}) } as never;

test('stamps unbox now + operator, deriving intake path', async () => {
  const { deps, calls } = fakeDeps();
  await acknowledgeUnbox(client, 'org-1', 42, 7, deps);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    orgId: 'org-1',
    receivingId: 42,
    patch: { unboxedAt: 'now', unboxedBy: 7, deriveIntakePath: true },
  });
});

test('no-op when the line has no carton (receivingId null/undefined)', async () => {
  const { deps, calls } = fakeDeps();
  await acknowledgeUnbox(client, 'org-1', null, 7, deps);
  await acknowledgeUnbox(client, 'org-1', undefined, 7, deps);
  assert.equal(calls.length, 0);
});

test('null staff → unboxedBy null (still stamps the milestone)', async () => {
  const { deps, calls } = fakeDeps();
  await acknowledgeUnbox(client, 'org-1', 1, null, deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].patch.unboxedBy, null);
});
