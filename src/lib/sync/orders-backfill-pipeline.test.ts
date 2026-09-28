/**
 * Run: npx tsx --test src/lib/sync/orders-backfill-pipeline.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import { runOrdersBackfillPipeline, type OrdersBackfillDeps } from './orders-backfill-pipeline';

const ORG = 'org-test' as OrgId;

function fakes(providers: string[], failing: Record<string, 'outcome' | 'throw'> = {}) {
  const calls: string[] = [];
  const deps: OrdersBackfillDeps = {
    listOrderProviders: async () => providers,
    syncProvider: async (_org, provider, opts) => {
      calls.push(opts?.full ? `${provider}:full` : provider);
      if (failing[provider] === 'throw') throw new Error(`${provider} down`);
      if (failing[provider] === 'outcome') return { ok: false, error: 'PLAN_LIMIT' };
      return { ok: true, imported: 1, updated: 2 };
    },
    resolveExceptions: async () => {
      calls.push('exceptions');
      return { matched: 3 };
    },
  };
  return { deps, calls };
}

test('runs every provider in the listed order, then exceptions last; totals add up', async () => {
  const { deps, calls } = fakes(['shipstation', 'google_sheets', 'square']);
  const out = await runOrdersBackfillPipeline(ORG, deps);
  assert.deepEqual(calls, ['shipstation', 'google_sheets', 'square', 'exceptions']);
  assert.equal(out.ok, true);
  assert.equal(out.imported, 3);
  assert.equal(out.updated, 9, '2 per provider + 3 exceptions matched');
});

test('a failing step never stops the rest, and the result names it', async () => {
  const { deps, calls } = fakes(['shipstation', 'google_sheets'], { shipstation: 'throw', google_sheets: 'outcome' });
  const out = await runOrdersBackfillPipeline(ORG, deps);
  assert.deepEqual(calls, ['shipstation', 'google_sheets', 'exceptions']);
  assert.equal(out.ok, false);
  assert.deepEqual(
    out.steps.filter((s) => !s.ok).map((s) => [s.step, s.error]),
    [['shipstation', 'shipstation down'], ['google_sheets', 'PLAN_LIMIT']],
  );
});

test('sheetsFull reaches only the Google Sheets step; an org with nothing linked does nothing', async () => {
  const { deps, calls } = fakes(['shipstation', 'google_sheets']);
  await runOrdersBackfillPipeline(ORG, deps, { sheetsFull: true });
  assert.deepEqual(calls, ['shipstation', 'google_sheets:full', 'exceptions']);

  const empty = fakes([]);
  const out = await runOrdersBackfillPipeline(ORG, empty.deps);
  assert.deepEqual(empty.calls, []);
  assert.deepEqual(out, { ok: true, steps: [], imported: 0, updated: 0 });
});
