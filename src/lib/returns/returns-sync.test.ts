/**
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/returns/returns-sync.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { PoCsvImportInput, PoCsvOrderSummary } from '@/lib/inbound/po-csv-import';
import type { ImportRunMeta, ImportStepInput } from '@/lib/sync/import-record';
import type { ReturnReportFile, ReturnWindow, ReturnsProvider } from './return-files';
import {
  RETURNS_CURSOR_OVERLAP_DAYS,
  RETURNS_FIRST_RUN_LOOKBACK_DAYS,
  RETURNS_MAX_WINDOW_DAYS,
  ReturnsNotConnectedError,
  incrementalReturnsWindow,
  runReturnsSync,
  type ReturnsFileImport,
  type ReturnsSyncDeps,
} from './returns-sync';

const ORG = 'org-test' as OrgId;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-09T12:00:00.000Z');

const FILE: ReturnReportFile = {
  fileName: 'ebay-returns 2026-10-01..2026-10-09',
  preset: 'ebay_returns',
  headers: ['Order number', 'Return reason'],
  rows: [{ 'Order number': '12-345', 'Return reason': 'Not as described' }],
};

function summary(extra: Partial<PoCsvOrderSummary> = {}): PoCsvOrderSummary {
  return { orders: 1, new: 1, updated: 0, unchanged: 0, needsFix: 0, landed: 1, failed: 0, ...extra };
}

interface FakeOpts {
  cursor?: Date | null;
  fetch?: (provider: ReturnsProvider, window: ReturnWindow) => Promise<ReturnReportFile[]>;
  importResult?: ReturnsFileImport | Error;
}

function fakes(opts: FakeOpts = {}) {
  const seen = {
    fetched: [] as ReturnWindow[],
    imports: [] as PoCsvImportInput[],
    cursorWrites: [] as Array<{ resource: string; at: Date }>,
    runs: [] as ImportRunMeta[],
    steps: [] as ImportStepInput[],
    finished: 0,
  };
  const deps: ReturnsSyncDeps = {
    fetchFiles: async (_org, provider, window) => {
      seen.fetched.push(window);
      return opts.fetch ? opts.fetch(provider, window) : [FILE];
    },
    importFile: async (_org, input) => {
      seen.imports.push(input);
      const result = opts.importResult ?? { batchId: input.dryRun ? null : 7, summary: summary(), missingRequired: [] };
      if (result instanceof Error) throw result;
      return result;
    },
    getCursor: async () => opts.cursor ?? null,
    updateCursor: async (_org, resource, at) => {
      seen.cursorWrites.push({ resource, at });
    },
    startImportRun: async (_org, meta) => {
      seen.runs.push(meta);
      return {
        runId: 41,
        step: async (input) => {
          seen.steps.push(input);
        },
        finish: async () => {
          seen.finished += 1;
        },
        fail: async () => {},
      };
    },
    now: () => NOW,
  };
  return { deps, seen };
}

test('incremental window: first run reads a bounded lookback up to now', () => {
  const w = incrementalReturnsWindow(null, NOW);
  assert.equal(w.until.getTime(), NOW.getTime());
  assert.equal(NOW.getTime() - w.since.getTime(), RETURNS_FIRST_RUN_LOOKBACK_DAYS * DAY);
});

test('incremental window: resumes from the cursor minus the overlap', () => {
  const cursor = new Date(NOW.getTime() - 3 * DAY);
  const w = incrementalReturnsWindow(cursor, NOW);
  assert.equal(w.since.getTime(), cursor.getTime() - RETURNS_CURSOR_OVERLAP_DAYS * DAY);
  assert.equal(w.until.getTime(), NOW.getTime());
});

test('incremental window: a stale cursor catches up one bounded window per run', () => {
  const cursor = new Date(NOW.getTime() - 120 * DAY);
  const w = incrementalReturnsWindow(cursor, NOW);
  assert.equal(w.until.getTime() - w.since.getTime(), RETURNS_MAX_WINDOW_DAYS * DAY);
  assert.ok(w.until < NOW);
});

test('success advances the incremental cursor to the window end and records one run', async () => {
  const cursor = new Date(NOW.getTime() - 1 * DAY);
  const { deps, seen } = fakes({ cursor });
  const result = await runReturnsSync(ORG, { provider: 'ebay', dryRun: false, trigger: 'cron', cronRunId: 9 }, deps);

  assert.equal(result.status, 'synced');
  assert.equal(result.ok, true);
  assert.equal(result.cursorAdvanced, true);
  assert.deepEqual(seen.cursorWrites, [{ resource: 'returns:ebay', at: NOW }]);
  assert.equal(seen.imports.length, 1);
  assert.equal(seen.imports[0].preset, 'ebay_returns');
  assert.equal(seen.imports[0].dryRun, false);
  assert.equal(seen.imports[0].staffId, null);
  assert.deepEqual(seen.imports[0].headers, FILE.headers);
  assert.deepEqual(seen.runs, [{ kind: 'provider', trigger: 'cron', staffId: null, cronRunId: 9 }]);
  assert.equal(seen.steps.length, 1);
  assert.equal(seen.steps[0].step, 'ebay_returns');
  assert.equal(seen.steps[0].ok, true);
  assert.equal(seen.steps[0].imported, 1);
  assert.equal(seen.finished, 1);
  assert.equal(result.importRunId, 41);
  assert.equal(result.files[0].batchId, 7);
});

test('a dry run never advances the cursor and records no run', async () => {
  const { deps, seen } = fakes();
  const result = await runReturnsSync(ORG, { provider: 'amazon', dryRun: true, trigger: 'manual', staffId: 3 }, deps);

  assert.equal(result.ok, true);
  assert.equal(result.cursorAdvanced, false);
  assert.deepEqual(seen.cursorWrites, []);
  assert.deepEqual(seen.runs, []);
  assert.equal(seen.imports[0].dryRun, true);
  assert.equal(seen.imports[0].staffId, 3);
});

test('a fetch failure leaves the cursor and is recorded as a failed step', async () => {
  const { deps, seen } = fakes({
    fetch: async () => {
      throw new Error('SP-API 503');
    },
  });
  const result = await runReturnsSync(ORG, { provider: 'amazon', dryRun: false, trigger: 'cron' }, deps);

  assert.equal(result.status, 'failed');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'SP-API 503');
  assert.deepEqual(seen.cursorWrites, []);
  assert.equal(seen.steps.length, 1);
  assert.equal(seen.steps[0].step, 'returns:amazon');
  assert.equal(seen.steps[0].ok, false);
  assert.equal(seen.finished, 1);
});

test('an order that failed to write leaves the cursor so the window is read again', async () => {
  const { deps, seen } = fakes({ importResult: { batchId: 7, summary: summary({ landed: 0, failed: 1 }), missingRequired: [] } });
  const result = await runReturnsSync(ORG, { provider: 'ebay', dryRun: false, trigger: 'cron' }, deps);

  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /1 order\(s\) failed to write/);
  assert.deepEqual(seen.cursorWrites, []);
  assert.equal(seen.steps[0].ok, false);
});

test('an import that throws or maps no required column fails the run and leaves the cursor', async () => {
  for (const importResult of [
    new Error('db down'),
    { batchId: null, summary: summary({ orders: 0, new: 0, landed: 0 }), missingRequired: ['order_number'] },
  ]) {
    const { deps, seen } = fakes({ importResult });
    const result = await runReturnsSync(ORG, { provider: 'ebay', dryRun: false, trigger: 'cron' }, deps);
    assert.equal(result.ok, false);
    assert.equal(result.files[0].ok, false);
    assert.deepEqual(seen.cursorWrites, []);
  }
});

test('not connected is a skip: ok, nothing imported, recorded or advanced', async () => {
  const { deps, seen } = fakes({
    fetch: async (provider) => {
      throw new ReturnsNotConnectedError(provider);
    },
  });
  const result = await runReturnsSync(ORG, { provider: 'ebay', dryRun: false, trigger: 'cron' }, deps);

  assert.equal(result.status, 'not_connected');
  assert.equal(result.ok, true);
  assert.equal(result.error, undefined);
  assert.deepEqual(seen.imports, []);
  assert.deepEqual(seen.runs, []);
  assert.deepEqual(seen.cursorWrites, []);
});

test('an explicit window is read as given and never moves the incremental cursor', async () => {
  const window = { since: new Date('2025-06-01T00:00:00Z'), until: new Date('2025-07-01T00:00:00Z') };
  const { deps, seen } = fakes({ cursor: new Date(NOW.getTime() - DAY) });
  const result = await runReturnsSync(ORG, { provider: 'ebay', window, dryRun: false, trigger: 'manual' }, deps);

  assert.equal(result.ok, true);
  assert.deepEqual(seen.fetched, [window]);
  assert.equal(result.cursorAdvanced, false);
  assert.deepEqual(seen.cursorWrites, []);
});

test('no files: synced, cursor advanced, no empty import run', async () => {
  const { deps, seen } = fakes({ fetch: async () => [] });
  const result = await runReturnsSync(ORG, { provider: 'amazon', dryRun: false, trigger: 'cron' }, deps);

  assert.equal(result.status, 'synced');
  assert.equal(result.cursorAdvanced, true);
  assert.deepEqual(seen.runs, []);
  assert.equal(result.importRunId, null);
});
