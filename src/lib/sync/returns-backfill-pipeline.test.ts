/**
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/sync/returns-backfill-pipeline.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ReturnWindow, ReturnsProvider } from '@/lib/returns/return-files';
import type { ReturnsSyncOpts, ReturnsSyncResult } from '@/lib/returns/returns-sync';
import {
  planReturnChunks,
  runReturnsBackfillPipeline,
  type ReturnsBackfillDeps,
} from './returns-backfill-pipeline';

const ORG = 'org-test' as OrgId;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-09T00:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function syncResult(opts: ReturnsSyncOpts, extra: Partial<ReturnsSyncResult> = {}): ReturnsSyncResult {
  return {
    provider: opts.provider,
    status: 'synced',
    ok: true,
    window: { since: opts.window!.since.toISOString(), until: opts.window!.until.toISOString() },
    dryRun: opts.dryRun,
    files: [],
    cursorAdvanced: false,
    importRunId: null,
    ...extra,
  };
}

function fakes(opts: {
  frontier?: Partial<Record<ReturnsProvider, Date>>;
  sync?: (opts: ReturnsSyncOpts, call: number) => Partial<ReturnsSyncResult> | Error;
} = {}) {
  const cursors = new Map<string, Date>(
    Object.entries(opts.frontier ?? {}).map(([p, d]) => [`returns-backfill:${p}`, d as Date]),
  );
  const seen = { syncs: [] as ReturnsSyncOpts[], writes: [] as Array<{ resource: string; at: Date }> };
  const deps: ReturnsBackfillDeps = {
    sync: async (_org, syncOpts) => {
      seen.syncs.push(syncOpts);
      const extra = opts.sync?.(syncOpts, seen.syncs.length) ?? {};
      if (extra instanceof Error) throw extra;
      return syncResult(syncOpts, extra);
    },
    getCursor: async (_org, resource) => cursors.get(resource) ?? null,
    updateCursor: async (_org, resource, at) => {
      seen.writes.push({ resource, at });
      cursors.set(resource, at);
    },
    now: () => NOW,
  };
  return { deps, seen, cursors };
}

const span = (w: ReturnWindow) => [w.since.getTime(), w.until.getTime()];

test('chunk planner: newest first, provider-sized, the oldest chunk is the short one', () => {
  const chunks = planReturnChunks({ since: daysAgo(70), until: NOW }, 30);
  assert.deepEqual(chunks.map(span), [
    span({ since: daysAgo(30), until: NOW }),
    span({ since: daysAgo(60), until: daysAgo(30) }),
    span({ since: daysAgo(70), until: daysAgo(60) }),
  ]);
});

test('chunk planner: an exact multiple has no empty tail; an empty window has no chunks', () => {
  assert.equal(planReturnChunks({ since: daysAgo(60), until: NOW }, 30).length, 2);
  assert.deepEqual(planReturnChunks({ since: NOW, until: NOW }, 30), []);
  assert.deepEqual(planReturnChunks({ since: NOW, until: daysAgo(1) }, 30), []);
});

test('first walk: from now down, frontier follows each landed chunk, bounded per call', async () => {
  const { deps, seen } = fakes();
  const result = await runReturnsBackfillPipeline(ORG, deps, { providers: ['ebay'], since: daysAgo(100), maxChunks: 2 });

  const ebay = result.providers[0];
  assert.equal(ebay.status, 'partial');
  assert.equal(ebay.ok, true);
  assert.equal(ebay.chunks.length, 2);
  assert.equal(ebay.remainingChunks, 2);
  assert.deepEqual(seen.syncs.map((s) => span(s.window!)), [
    span({ since: daysAgo(30), until: NOW }),
    span({ since: daysAgo(60), until: daysAgo(30) }),
  ]);
  assert.deepEqual(seen.writes, [
    { resource: 'returns-backfill:ebay', at: daysAgo(30) },
    { resource: 'returns-backfill:ebay', at: daysAgo(60) },
  ]);
  assert.equal(ebay.frontier, daysAgo(60).toISOString());
});

test('resume: the next call starts at the frontier and completes the range', async () => {
  const { deps, seen } = fakes({ frontier: { ebay: daysAgo(60) } });
  const result = await runReturnsBackfillPipeline(ORG, deps, { providers: ['ebay'], since: daysAgo(100) });

  assert.equal(result.providers[0].status, 'complete');
  assert.deepEqual(seen.syncs.map((s) => span(s.window!)), [
    span({ since: daysAgo(90), until: daysAgo(60) }),
    span({ since: daysAgo(100), until: daysAgo(90) }),
  ]);
  assert.equal(result.providers[0].frontier, daysAgo(100).toISOString());
});

test('a frontier already past since is complete with no fetch', async () => {
  const { deps, seen } = fakes({ frontier: { amazon: daysAgo(200) } });
  const result = await runReturnsBackfillPipeline(ORG, deps, { providers: ['amazon'], since: daysAgo(100) });
  assert.equal(result.providers[0].status, 'complete');
  assert.equal(result.providers[0].remainingChunks, 0);
  assert.deepEqual(seen.syncs, []);
});

test('a dry run walks the chunks but never writes the frontier', async () => {
  const { deps, seen } = fakes();
  const result = await runReturnsBackfillPipeline(ORG, deps, { providers: ['ebay'], since: daysAgo(40), dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(seen.syncs.length, 2);
  assert.ok(seen.syncs.every((s) => s.dryRun));
  assert.deepEqual(seen.writes, []);
});

test('a failed chunk stops that provider below the last good frontier; the other provider still runs', async () => {
  const { deps, seen } = fakes({
    sync: (opts, call) => (opts.provider === 'ebay' && call === 2 ? { status: 'failed', ok: false, error: 'eBay 500' } : {}),
  });
  const result = await runReturnsBackfillPipeline(ORG, deps, { since: daysAgo(90) });

  const [ebay, amazon] = result.providers;
  assert.equal(ebay.status, 'failed');
  assert.equal(ebay.error, 'eBay 500');
  assert.equal(ebay.frontier, daysAgo(30).toISOString());
  assert.equal(amazon.status, 'complete');
  assert.equal(result.ok, false);
  assert.deepEqual(
    seen.writes.filter((w) => w.resource === 'returns-backfill:ebay').map((w) => w.at),
    [daysAgo(30)],
  );
});

test('a provider that throws is isolated as failed', async () => {
  const { deps } = fakes({ sync: (opts) => (opts.provider === 'amazon' ? new Error('vault down') : {}) });
  const result = await runReturnsBackfillPipeline(ORG, deps, { since: daysAgo(10) });
  assert.equal(result.providers[0].status, 'complete');
  assert.equal(result.providers[1].status, 'failed');
  assert.equal(result.providers[1].error, 'vault down');
});

test('not connected skips the provider without writing a frontier', async () => {
  const { deps, seen } = fakes({ sync: (opts) => (opts.provider === 'ebay' ? { status: 'not_connected' } : {}) });
  const result = await runReturnsBackfillPipeline(ORG, deps, { since: daysAgo(10) });
  assert.equal(result.providers[0].status, 'not_connected');
  assert.equal(result.providers[0].ok, true);
  assert.deepEqual(result.providers[0].chunks, []);
  assert.equal(result.ok, true);
  assert.ok(seen.writes.every((w) => w.resource !== 'returns-backfill:ebay'));
});

test('an explicit range below the frontier is walked without moving the frontier', async () => {
  const { deps, seen } = fakes({ frontier: { ebay: daysAgo(30) } });
  await runReturnsBackfillPipeline(ORG, deps, { providers: ['ebay'], since: daysAgo(200), until: daysAgo(150) });
  assert.equal(seen.syncs.length, 2);
  assert.deepEqual(seen.writes, []);
});

test('the deadline stops new chunks', async () => {
  const { deps, seen } = fakes();
  const result = await runReturnsBackfillPipeline(ORG, deps, { providers: ['ebay'], since: daysAgo(90), deadline: NOW });
  assert.equal(result.providers[0].status, 'partial');
  assert.deepEqual(seen.syncs, []);
});

test('default range is 18 months back to now', async () => {
  const { deps } = fakes({ frontier: { ebay: daysAgo(10_000), amazon: daysAgo(10_000) } });
  const result = await runReturnsBackfillPipeline(ORG, deps);
  assert.equal(result.until, NOW.toISOString());
  assert.equal(result.since, '2025-04-09T00:00:00.000Z');
});
