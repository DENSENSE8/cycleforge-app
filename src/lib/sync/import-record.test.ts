/**
 * Run: npx tsx --test src/lib/sync/import-record.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ImportRowRecord } from '@/lib/imports/types';
import {
  importRowsCappedOutcome,
  IMPORT_ROWS_RESPONSE_CAP,
  recordProviderSync,
  startImportRun,
  type ImportRecordDeps,
  type ImportRunFinish,
  type ImportRunMeta,
  type ImportStepWrite,
} from './import-record';

const ORG = '11111111-1111-4111-8111-111111111111' as OrgId;
const META: ImportRunMeta = { kind: 'pipeline', trigger: 'manual', staffId: 7, cronRunId: 42 };
const T0 = new Date('2026-09-28T10:00:00Z');
const T1 = new Date('2026-09-28T10:00:05Z');

interface Captured {
  runs: Array<{ orgId: OrgId; meta: ImportRunMeta }>;
  steps: Array<{ orgId: OrgId; runId: number; step: ImportStepWrite; rows: readonly ImportRowRecord[] }>;
  finishes: Array<{ orgId: OrgId; runId: number; finish: ImportRunFinish }>;
  warnings: string[];
}

function fakes(failing: Partial<Record<'insertRun' | 'insertStep' | 'finishRun', true>> = {}) {
  const cap: Captured = { runs: [], steps: [], finishes: [], warnings: [] };
  const deps: ImportRecordDeps = {
    insertRun: async (orgId, meta) => {
      if (failing.insertRun) throw new Error('relation "order_import_runs" does not exist');
      cap.runs.push({ orgId, meta });
      return 9;
    },
    insertStep: async (orgId, runId, step, rows) => {
      if (failing.insertStep) throw new Error('insert failed');
      cap.steps.push({ orgId, runId, step, rows });
    },
    finishRun: async (orgId, runId, finish) => {
      if (failing.finishRun) throw new Error('update failed');
      cap.finishes.push({ orgId, runId, finish });
    },
    warn: (message) => {
      cap.warnings.push(message);
    },
  };
  return { deps, cap };
}

function row(outcome: ImportRowRecord['outcome'], externalOrderId = `ext-${outcome}`): ImportRowRecord {
  return { orderRowId: outcome === 'skipped' ? null : 1, externalOrderId, accountSource: 'ebay-main', platform: 'ebay', outcome };
}

test('step counts come from the rows; unchanged counts in nothing; org and run id threaded to every write', async () => {
  const { deps, cap } = fakes();
  const rec = await startImportRun(ORG, META, deps);
  const rows = [
    row('inserted'),
    row('inserted', 'ext-2'),
    row('backfilled'),
    row('adopted'),
    row('claimed'),
    row('tracking_filled'),
    row('unchanged'),
    row('unchanged', 'ext-u2'),
    row('ambiguous'),
    row('quarantined'),
    row('skipped'),
    row('failed'),
  ];
  // The step's own totals disagree on purpose: rows win when present.
  await rec.step({ step: 'google_sheets', ok: true, imported: 99, updated: 99, rows, startedAt: T0, finishedAt: T1 });
  await rec.finish();

  assert.equal(rec.runId, 9);
  assert.deepEqual(cap.runs, [{ orgId: ORG, meta: META }]);
  assert.equal(cap.steps.length, 1);
  assert.equal(cap.steps[0].orgId, ORG);
  assert.equal(cap.steps[0].runId, 9);
  assert.deepEqual(cap.steps[0].step, {
    step: 'google_sheets',
    ok: true,
    counts: { imported: 2, updated: 4, trackingFilled: 1, ambiguous: 2, skipped: 1, failed: 1 },
    error: null,
    startedAt: T0,
    finishedAt: T1,
  });
  assert.equal(cap.steps[0].rows, rows, 'every emitted row is persisted with its step');
  assert.deepEqual(cap.finishes, [
    {
      orgId: ORG,
      runId: 9,
      finish: {
        status: 'success',
        counts: { google_sheets: { imported: 2, updated: 4, trackingFilled: 1, ambiguous: 2, skipped: 1, failed: 1 } },
        error: null,
      },
    },
  ]);
});

test('a second run over unchanged data records zero counts, not the rows it read', async () => {
  const { deps, cap } = fakes();
  const rec = await startImportRun(ORG, META, deps);
  await rec.step({ step: 'shipstation', ok: true, imported: 0, updated: 0, rows: [row('unchanged'), row('unchanged', 'b')], startedAt: T0, finishedAt: T1 });
  await rec.finish();
  assert.deepEqual(cap.finishes[0].finish.counts.shipstation, {
    imported: 0,
    updated: 0,
    trackingFilled: 0,
    ambiguous: 0,
    skipped: 0,
    failed: 0,
  });
});

test('a step without rows falls back to its own imported / updated totals', async () => {
  const { deps, cap } = fakes();
  const rec = await startImportRun(ORG, META, deps);
  await rec.step({ step: 'square', ok: true, imported: 3, updated: 4, startedAt: T0, finishedAt: T1 });
  await rec.step({ step: 'exceptions', ok: true, updated: 2, rows: [], startedAt: T0, finishedAt: T1 });
  await rec.finish();
  assert.deepEqual(cap.finishes[0].finish.counts, {
    square: { imported: 3, updated: 4, trackingFilled: 0, ambiguous: 0, skipped: 0, failed: 0 },
    exceptions: { imported: 0, updated: 2, trackingFilled: 0, ambiguous: 0, skipped: 0, failed: 0 },
  });
});

test('status: some step failed = partial with the failed steps named; every step failed = failed', async () => {
  const partial = fakes();
  const rec = await startImportRun(ORG, META, partial.deps);
  await rec.step({ step: 'shipstation', ok: false, error: 'HTTP 401', startedAt: T0, finishedAt: T1 });
  await rec.step({ step: 'google_sheets', ok: true, startedAt: T0, finishedAt: T1 });
  await rec.step({ step: 'square', ok: false, startedAt: T0, finishedAt: T1 });
  await rec.finish();
  assert.equal(partial.cap.finishes[0].finish.status, 'partial');
  assert.equal(partial.cap.finishes[0].finish.error, 'shipstation: HTTP 401 · square: failed');
  assert.equal(partial.cap.steps[0].step.error, 'HTTP 401');
  assert.equal(partial.cap.steps[2].step.error, 'failed', 'a failed step without a message still reads as failed');

  const allFailed = fakes();
  const rec2 = await startImportRun(ORG, META, allFailed.deps);
  await rec2.step({ step: 'shipstation', ok: false, error: 'down', startedAt: T0, finishedAt: T1 });
  await rec2.finish();
  assert.equal(allFailed.cap.finishes[0].finish.status, 'failed');
  assert.equal(allFailed.cap.finishes[0].finish.error, 'shipstation: down');
});

test('fail() closes as failed once; a later finish() does not rewrite it', async () => {
  const { deps, cap } = fakes();
  const rec = await startImportRun(ORG, META, deps);
  await rec.step({ step: 'shipstation', ok: true, startedAt: T0, finishedAt: T1 });
  await rec.fail(new Error('listOrderProviders timed out'));
  await rec.finish();
  assert.equal(cap.finishes.length, 1);
  assert.equal(cap.finishes[0].finish.status, 'failed');
  assert.equal(cap.finishes[0].finish.error, 'listOrderProviders timed out');
});

test('recorder failures never throw into the sync', async () => {
  const noRun = fakes({ insertRun: true });
  const rec = await startImportRun(ORG, META, noRun.deps);
  assert.equal(rec.runId, null);
  await rec.step({ step: 'shipstation', ok: true, rows: [row('inserted')], startedAt: T0, finishedAt: T1 });
  await rec.finish();
  assert.deepEqual(noRun.cap.steps, [], 'no run row → no orphan steps');
  assert.deepEqual(noRun.cap.finishes, []);
  assert.deepEqual(noRun.cap.warnings, ['import record: run insert failed']);

  const brokenWrites = fakes({ insertStep: true, finishRun: true });
  const rec2 = await startImportRun(ORG, META, brokenWrites.deps);
  await rec2.step({ step: 'shipstation', ok: true, rows: [row('inserted')], startedAt: T0, finishedAt: T1 });
  await rec2.finish();
  assert.deepEqual(brokenWrites.cap.warnings, ['import record: step insert failed', 'import record: run finish failed']);
});

test('recordProviderSync: one step named for the provider, outcome passed through', async () => {
  const { deps, cap } = fakes();
  const rows = [row('inserted'), row('tracking_filled')];
  const outcome = await recordProviderSync(
    ORG,
    'shipstation',
    { kind: 'provider', trigger: 'manual', staffId: 3, cronRunId: null },
    async () => ({ ok: true, imported: 1, updated: 1, importRows: rows }),
    deps,
  );
  assert.deepEqual(outcome, { ok: true, imported: 1, updated: 1, importRows: rows });
  assert.deepEqual(cap.runs[0].meta, { kind: 'provider', trigger: 'manual', staffId: 3, cronRunId: null });
  assert.equal(cap.steps[0].step.step, 'shipstation');
  assert.equal(cap.steps[0].rows, rows);
  assert.equal(cap.finishes[0].finish.status, 'success');
});

test('recordProviderSync: a thrown sync is recorded as a failed run and rethrown', async () => {
  const { deps, cap } = fakes();
  await assert.rejects(
    recordProviderSync(ORG, 'square', META, async () => {
      throw new Error('token expired');
    }, deps),
    /token expired/,
  );
  assert.equal(cap.steps[0].step.ok, false);
  assert.equal(cap.steps[0].step.error, 'token expired');
  assert.equal(cap.finishes[0].finish.status, 'failed');
  assert.equal(cap.finishes[0].finish.error, 'square: token expired');
});

test('importRowsCappedOutcome keeps small row lists and drops large ones', () => {
  const small = { ok: true, importRows: [row('inserted')] };
  assert.equal(importRowsCappedOutcome(small), small);
  const big = { ok: true, imported: 1, importRows: Array.from({ length: IMPORT_ROWS_RESPONSE_CAP + 1 }, () => row('inserted')) };
  assert.deepEqual(importRowsCappedOutcome(big), { ok: true, imported: 1 });
  assert.equal(big.importRows.length, IMPORT_ROWS_RESPONSE_CAP + 1, 'the recorder input is not mutated');
});
