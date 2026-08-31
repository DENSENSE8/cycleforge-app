import assert from 'node:assert/strict';
import test from 'node:test';

import type { OrgId } from '@/lib/tenancy/constants';
import {
  markSearchResultOpened,
  recordSearchQuery,
  zeroResultWorklist,
  type QueryLogDeps,
} from '@/lib/search/query-log';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

interface Call {
  orgId: OrgId;
  sql: string;
  params: readonly unknown[];
}

function fakes(overrides: Partial<QueryLogDeps> = {}) {
  const writes: Call[] = [];
  const reads: Call[] = [];
  let readRows: Array<Record<string, unknown>> = [];

  const deps: QueryLogDeps = {
    write: async (orgId, sql, params) => {
      writes.push({ orgId, sql, params });
      return { rowCount: 1 };
    },
    read: async (orgId, sql, params) => {
      reads.push({ orgId, sql, params });
      return readRows as never[];
    },
    ...overrides,
  };

  return {
    deps,
    writes,
    reads,
    setReadRows(rows: Array<Record<string, unknown>>) {
      readRows = rows;
    },
  };
}

// ── recordSearchQuery ───────────────────────────────────────────────────────

test('records the raw query AND its normalized grouping key', async () => {
  const f = fakes();
  await recordSearchQuery(
    { orgId: ORG, staffId: 7, query: '  Dell   7400 ', resultCount: 3, latencyMs: 42 },
    f.deps,
  );

  assert.equal(f.writes.length, 1);
  const [, staffId, raw, normalized] = f.writes[0].params;
  assert.equal(staffId, 7);
  assert.equal(raw, '  Dell   7400 ', 'raw text is kept verbatim — the bug is often in the typing');
  assert.equal(normalized, 'dell 7400');
});

test('a blank query is never logged — the palette fires those on open/close', async () => {
  const f = fakes();
  await recordSearchQuery({ orgId: ORG, staffId: 1, query: '   ', resultCount: 0 }, f.deps);
  assert.equal(f.writes.length, 0);
});

test('a zero-result search IS logged — it is the row the worklist exists for', async () => {
  const f = fakes();
  await recordSearchQuery({ orgId: ORG, staffId: 1, query: 'rma', resultCount: 0 }, f.deps);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].params[6], 0);
});

test('relaxation and semantic flags are carried, defaulting to false', async () => {
  const f = fakes();
  await recordSearchQuery(
    { orgId: ORG, staffId: 1, query: 'broken box', resultCount: 2, relaxed: true },
    f.deps,
  );
  assert.equal(f.writes[0].params[7], true, 'relaxed');
  assert.equal(f.writes[0].params[8], false, 'usedSemantic defaults false');
});

test('the org id is threaded into both the tenant scope and the row', async () => {
  const f = fakes();
  await recordSearchQuery({ orgId: ORG, staffId: 1, query: 'x1', resultCount: 1 }, f.deps);
  assert.equal(f.writes[0].orgId, ORG);
  assert.equal(f.writes[0].params[0], ORG);
});

test('a telemetry failure degrades to blindness, never to a broken search', async () => {
  const f = fakes({
    write: async () => {
      throw new Error('db down');
    },
  });
  await assert.doesNotReject(() =>
    recordSearchQuery({ orgId: ORG, staffId: 1, query: 'x', resultCount: 0 }, f.deps),
  );
});

// ── markSearchResultOpened ──────────────────────────────────────────────────

test('the open stamps the most recent UNOPENED row for that query', async () => {
  const f = fakes();
  await markSearchResultOpened(
    { orgId: ORG, staffId: 3, query: 'Dell 7400', entityType: 'order', entityId: 91 },
    f.deps,
  );

  const { sql, params } = f.writes[0];
  assert.match(sql, /opened_at IS NULL/, 'must not re-stamp an already-answered search');
  assert.match(sql, /ORDER BY created_at DESC/, 'the last keystroke is the query they chose from');
  assert.equal(params[0], 'order');
  assert.equal(params[1], 91);
  assert.equal(params[3], 'dell 7400', 'matched on the normalized key');
});

test('a NULL staff id matches a NULL staff id, not nothing', async () => {
  const f = fakes();
  await markSearchResultOpened(
    { orgId: ORG, staffId: null, query: 'abc', entityType: 'sku', entityId: 1 },
    f.deps,
  );
  assert.match(f.writes[0].sql, /IS NOT DISTINCT FROM/);
});

// ── zeroResultWorklist ──────────────────────────────────────────────────────

test('the worklist returns misses ranked worst first', async () => {
  const f = fakes();
  f.setReadRows([
    { normalized_query: 'rma', misses: '12', distinct_staff: '4', last_seen_at: '2026-08-29' },
    { normalized_query: 'wismo', misses: '3', distinct_staff: '1', last_seen_at: '2026-08-28' },
  ]);

  const rows = await zeroResultWorklist(ORG, {}, f.deps);
  assert.deepEqual(rows.map((r) => r.normalizedQuery), ['rma', 'wismo']);
  assert.equal(rows[0].misses, 12, 'counts come back as numbers, not pg strings');
  assert.equal(rows[0].distinctStaff, 4);
});

test('the worklist only ever reads zero-result rows', async () => {
  const f = fakes();
  await zeroResultWorklist(ORG, {}, f.deps);
  assert.match(f.reads[0].sql, /result_count = 0/);
});

test('worklist limits are clamped, so a hostile limit cannot scan the table', async () => {
  const f = fakes();
  await zeroResultWorklist(ORG, { limit: 10_000, sinceDays: 9_999 }, f.deps);
  assert.equal(f.reads[0].params[2], 500);
  assert.equal(f.reads[0].params[1], '365');
});

test('a read failure returns an empty worklist rather than throwing', async () => {
  const f = fakes({
    read: async () => {
      throw new Error('db down');
    },
  });
  assert.deepEqual(await zeroResultWorklist(ORG, {}, f.deps), []);
});
