import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertNotProductionUrl,
  neonEndpointIdentity,
  createVerifyBranch,
  deleteBranch,
  listVerifyBranches,
  sweepExpiredVerifyBranches,
  VERIFY_BRANCH_PREFIX,
  type NeonBranchDeps,
} from './branches';

const PROD_URL = 'postgres://user:pw@ep-prod-123.us-east-2.aws.neon.tech/neondb';

function fakes(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  let i = 0;
  const deps: NeonBranchDeps = {
    fetchFn: async (url, init) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    },
    env: {
      NEON_API_KEY: 'test-key',
      NEON_PROJECT_ID: 'proj-1',
      DATABASE_URL: PROD_URL,
    },
    now: () => Date.parse('2026-07-11T12:00:00Z'),
  };
  return { deps, calls };
}

test('guard: rejects the production host, empty candidates, and a missing baseline', () => {
  const { deps } = fakes([]);
  assert.throws(() => assertNotProductionUrl(PROD_URL, deps), /refusing to run agent VERIFY against production/);
  assert.throws(() => assertNotProductionUrl('', deps), /empty candidate/);
  assert.throws(
    () => assertNotProductionUrl('postgres://u:p@ep-branch-9.aws.neon.tech/neondb', { ...deps, env: { ...deps.env, DATABASE_URL: undefined } }),
    /DATABASE_URL unset/,
  );
  // A genuinely different branch host passes.
  assertNotProductionUrl('postgres://u:p@ep-branch-9.us-east-2.aws.neon.tech/neondb', deps);
});

test('guard: a POOLER alias of the production endpoint is still rejected', () => {
  // Prod is the direct endpoint; the pooled variant of the SAME endpoint must
  // not sneak past as "different host".
  assert.equal(
    neonEndpointIdentity('ep-prod-123-pooler.us-east-2.aws.neon.tech'),
    neonEndpointIdentity('ep-prod-123.us-east-2.aws.neon.tech'),
  );
  const { deps } = fakes([]);
  const pooledProd = 'postgres://user:pw@ep-prod-123-pooler.us-east-2.aws.neon.tech/neondb';
  assert.throws(() => assertNotProductionUrl(pooledProd, deps), /production endpoint/);
});

test('createVerifyBranch names the branch, mints a URL, and re-checks the guard', async () => {
  const branchUri = 'postgres://u:p@ep-branch-42.us-east-2.aws.neon.tech/neondb';
  const { deps, calls } = fakes([
    { body: { branch: { id: 'br-42', name: `${VERIFY_BRANCH_PREFIX}run-1`, created_at: '2026-07-11T11:00:00Z' }, connection_uris: [{ connection_uri: branchUri }] } },
  ]);
  const branch = await createVerifyBranch('run-1', deps);
  assert.equal(branch.branchId, 'br-42');
  assert.equal(branch.connectionUri, branchUri);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /\/projects\/proj-1\/branches$/);
  assert.deepEqual(calls[0].body, { branch: { name: 'verify/run-1' }, endpoints: [{ type: 'read_write' }] });
});

test('createVerifyBranch REFUSES a prod URL AND deletes the orphaned branch', async () => {
  const { deps, calls } = fakes([
    { body: { branch: { id: 'br-bad', name: 'verify/run-2' }, connection_uris: [{ connection_uri: PROD_URL }] } },
    { body: {} }, // the cleanup DELETE
  ]);
  await assert.rejects(() => createVerifyBranch('run-2', deps), /production endpoint/);
  const del = calls.find((c) => c.method === 'DELETE');
  assert.ok(del, 'the just-created branch is deleted on the guard failure (no leak)');
  assert.match(del.url, /br-bad$/);
});

test('createVerifyBranch deletes the orphan when Neon returns no connection_uri', async () => {
  const { deps, calls } = fakes([
    { body: { branch: { id: 'br-7', name: 'verify/run-3' } } },
    { body: {} },
  ]);
  await assert.rejects(() => createVerifyBranch('run-3', deps), /no connection_uri/);
  assert.ok(calls.some((c) => c.method === 'DELETE' && /br-7$/.test(c.url)), 'orphan cleaned up');
});

test('config errors are explicit (no silent prod fallback)', async () => {
  const { deps } = fakes([]);
  await assert.rejects(
    () => createVerifyBranch('x', { ...deps, env: { ...deps.env, NEON_API_KEY: undefined } }),
    /NEON_API_KEY is not set/,
  );
  await assert.rejects(
    () => createVerifyBranch('x', { ...deps, env: { ...deps.env, NEON_PROJECT_ID: undefined } }),
    /NEON_PROJECT_ID is not set/,
  );
});

test('deleteBranch hits the branch endpoint; API errors surface with status', async () => {
  const { deps, calls } = fakes([{ body: {} }]);
  await deleteBranch('br-42', deps);
  assert.equal(calls[0].method, 'DELETE');
  assert.match(calls[0].url, /\/projects\/proj-1\/branches\/br-42$/);

  const failing = fakes([{ status: 404, body: { message: 'not found' } }]);
  await assert.rejects(() => deleteBranch('br-gone', failing.deps), /failed \(404\)/);
});

test('listVerifyBranches filters to the verify/ namespace only', async () => {
  const { deps } = fakes([
    {
      body: {
        branches: [
          { id: 'br-1', name: 'verify/run-1', created_at: '2026-07-11T00:00:00Z' },
          { id: 'br-main', name: 'main', created_at: '2026-01-01T00:00:00Z' },
          { id: 'br-qa', name: 'qa-sandbox', created_at: '2026-06-01T00:00:00Z' },
        ],
      },
    },
  ]);
  const branches = await listVerifyBranches(deps);
  assert.deepEqual(branches.map((b) => b.id), ['br-1']);
});

test('sweepExpiredVerifyBranches deletes only expired verify branches', async () => {
  const { deps, calls } = fakes([
    {
      body: {
        branches: [
          { id: 'br-old', name: 'verify/run-old', created_at: '2026-07-10T10:00:00Z' }, // >12h old
          { id: 'br-new', name: 'verify/run-new', created_at: '2026-07-11T11:30:00Z' }, // fresh
          { id: 'br-main', name: 'main', created_at: '2020-01-01T00:00:00Z' }, // never touched
        ],
      },
    },
    { body: {} },
  ]);
  const deleted = await sweepExpiredVerifyBranches(12 * 60, deps);
  assert.deepEqual(deleted, ['br-old']);
  const deleteCalls = calls.filter((c) => c.method === 'DELETE');
  assert.equal(deleteCalls.length, 1);
  assert.match(deleteCalls[0].url, /br-old$/);
});

test('sweep with a NaN TTL falls back to the default instead of a silent no-op', async () => {
  const { deps, calls } = fakes([
    {
      body: {
        branches: [
          { id: 'br-ancient', name: 'verify/run-x', created_at: '2026-07-01T00:00:00Z' }, // 10 days old
          { id: 'br-fresh', name: 'verify/run-y', created_at: '2026-07-11T11:59:00Z' },
        ],
      },
    },
    { body: {} },
  ]);
  const deleted = await sweepExpiredVerifyBranches(Number('12h'), deps); // NaN
  assert.deepEqual(deleted, ['br-ancient'], 'NaN TTL → default TTL sweeps the ancient branch');
  assert.ok(!calls.some((c) => c.method === 'DELETE' && /br-fresh$/.test(c.url)));
});
