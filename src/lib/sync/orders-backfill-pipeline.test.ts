/**
 * Run: npx tsx --test src/lib/sync/orders-backfill-pipeline.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ImportRowRecord } from '@/lib/imports/types';
import type { ImportRunMeta, ImportStepInput } from './import-record';
import { runOrdersBackfillPipeline, type OrdersBackfillDeps } from './orders-backfill-pipeline';

const ORG = 'org-test' as OrgId;

const SHEET_ROW: ImportRowRecord = {
  orderRowId: 5,
  externalOrderId: '12-345',
  accountSource: 'ebay-main',
  platform: 'ebay',
  outcome: 'inserted',
  sheetTab: 'Sheet_09_28_2026',
  sheetRow: 4,
};

function fakes(providers: string[], failing: Record<string, 'outcome' | 'throw'> = {}) {
  const calls: string[] = [];
  const record = {
    started: [] as Array<{ orgId: OrgId; meta: ImportRunMeta }>,
    steps: [] as ImportStepInput[],
    finished: 0,
    failed: [] as unknown[],
  };
  const deps: OrdersBackfillDeps = {
    listOrderProviders: async () => providers,
    syncProvider: async (_org, provider, opts) => {
      calls.push(opts?.full ? `${provider}:full` : provider);
      if (failing[provider] === 'throw') throw new Error(`${provider} down`);
      if (failing[provider] === 'outcome') return { ok: false, error: 'PLAN_LIMIT' };
      return { ok: true, imported: 1, updated: 2, importRows: provider === 'google_sheets' ? [SHEET_ROW] : undefined };
    },
    resolveExceptions: async () => {
      calls.push('exceptions');
      return { matched: 3 };
    },
    startImportRun: async (orgId, meta) => {
      record.started.push({ orgId, meta });
      return {
        runId: 1,
        step: async (input) => {
          record.steps.push(input);
        },
        finish: async () => {
          record.finished += 1;
        },
        fail: async (error) => {
          record.failed.push(error);
        },
      };
    },
  };
  return { deps, calls, record };
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
  assert.deepEqual(empty.record.started, [], 'nothing linked records no run');
});

test('records one run: meta from opts, one step per step with its rows, then finish', async () => {
  const { deps, record } = fakes(['shipstation', 'google_sheets'], { shipstation: 'throw' });
  const out = await runOrdersBackfillPipeline(ORG, deps, { trigger: 'manual', staffId: 7, cronRunId: 42 });

  assert.deepEqual(record.started, [
    { orgId: ORG, meta: { kind: 'pipeline', trigger: 'manual', staffId: 7, cronRunId: 42 } },
  ]);
  assert.deepEqual(
    record.steps.map((s) => [s.step, s.ok, s.error, s.imported, s.updated, s.rows]),
    [
      ['shipstation', false, 'shipstation down', undefined, undefined, undefined],
      ['google_sheets', true, undefined, 1, 2, [SHEET_ROW]],
      ['exceptions', true, undefined, undefined, 3, undefined],
    ],
  );
  for (const s of record.steps) assert.ok(s.finishedAt >= s.startedAt);
  assert.equal(record.finished, 1);
  assert.deepEqual(record.failed, []);
  assert.ok(!JSON.stringify(out).includes('importRows'), 'rows never ride the result / cron_runs.summary');
  assert.ok(!JSON.stringify(out).includes('12-345'));
});

test('sheetsFull records a sheets_full run; the cron default trigger is cron', async () => {
  const { deps, record } = fakes(['google_sheets']);
  await runOrdersBackfillPipeline(ORG, deps, { sheetsFull: true, cronRunId: 8 });
  assert.deepEqual(record.started[0].meta, { kind: 'sheets_full', trigger: 'cron', staffId: null, cronRunId: 8 });
});
