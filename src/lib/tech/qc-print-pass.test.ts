/**
 * DB-free unit test for runQcPrintPass — the outbox row's claim / retry /
 * FAILED transitions, driven through injected fakes.
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/tech/qc-print-pass.test.ts
 */
import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import {
  QC_PRINT_PASS_MAX_ATTEMPTS,
  QcPrintPassPermanentError,
  runQcPrintPass,
  type QcPrintPassDeps,
  type QcPrintPassRow,
} from './qc-print-pass';
import { GuardRejectedError } from './recordTestVerdict';

const ORG = '00000000-0000-4000-8000-000000000001';

function row(over: Partial<QcPrintPassRow> = {}): QcPrintPassRow {
  return {
    id: 11,
    organizationId: ORG,
    serialUnitId: 2969,
    clientEventId: 'testing-verdict-2969-PASS-abc',
    actorStaffId: 7,
    pass: true,
    unitUid: 'ABC-2641-000008',
    payload: {
      gtin: '01234567890128',
      symbology: 'gs1datamatrix',
      condition: 'LIKE_NEW',
      notes: null,
      product_sku: 'ABC',
      sku_catalog_id: 5,
      serial_number: '066563Z43211438AE',
    },
    attempts: 1,
    ...over,
  };
}

function fakes(claimed: QcPrintPassRow | null, over: Partial<QcPrintPassDeps> = {}) {
  const calls: string[] = [];
  const errors: Record<string, string> = {};
  const deps: QcPrintPassDeps = {
    claim: async () => {
      calls.push('claim');
      return claimed;
    },
    printRecord: async () => {
      calls.push('printRecord');
    },
    recordPass: async () => {
      calls.push('recordPass');
    },
    markDone: async () => {
      calls.push('markDone');
    },
    release: async (_row, error) => {
      calls.push('release');
      errors.release = error;
    },
    markFailed: async (_row, error) => {
      calls.push('markFailed');
      errors.markFailed = error;
    },
    notifyFailed: async (_row, reason) => {
      calls.push('notifyFailed');
      errors.notifyFailed = reason;
    },
    ...over,
  };
  return { deps, calls, errors };
}

test('a row it cannot claim (done, failed, live claim) does nothing', async () => {
  const { deps, calls } = fakes(null);
  strictEqual(await runQcPrintPass(ORG, 11, deps), 'not_claimed');
  deepStrictEqual(calls, ['claim']);
});

test('pass: print record, then the verdict, then DONE', async () => {
  const { deps, calls } = fakes(row());
  strictEqual(await runQcPrintPass(ORG, 11, deps), 'done');
  deepStrictEqual(calls, ['claim', 'printRecord', 'recordPass', 'markDone']);
});

test('reprint (pass=false): print record only, no verdict', async () => {
  const { deps, calls } = fakes(row({ pass: false }));
  strictEqual(await runQcPrintPass(ORG, 11, deps), 'done');
  deepStrictEqual(calls, ['claim', 'printRecord', 'markDone']);
});

test('a transient error under the cap releases the claim for a retry, no notice', async () => {
  const { deps, calls, errors } = fakes(row({ attempts: QC_PRINT_PASS_MAX_ATTEMPTS - 1 }), {
    recordPass: async () => {
      calls.push('recordPass');
      throw new Error('connection reset');
    },
  });
  strictEqual(await runQcPrintPass(ORG, 11, deps), 'retry');
  deepStrictEqual(calls, ['claim', 'printRecord', 'recordPass', 'release']);
  strictEqual(errors.release, 'connection reset');
});

test('a transient error on the last attempt is FAILED and reaches the tech', async () => {
  const { deps, calls, errors } = fakes(row({ attempts: QC_PRINT_PASS_MAX_ATTEMPTS }), {
    printRecord: async () => {
      calls.push('printRecord');
      throw new Error('print record incomplete: label_print_job');
    },
  });
  strictEqual(await runQcPrintPass(ORG, 11, deps), 'failed');
  deepStrictEqual(calls, ['claim', 'printRecord', 'markFailed', 'notifyFailed']);
  strictEqual(errors.notifyFailed, 'print record incomplete: label_print_job');
});

test('a guard refusal is FAILED on the first attempt — retrying cannot pass it', async () => {
  const { deps, calls, errors } = fakes(row(), {
    recordPass: async () => {
      calls.push('recordPass');
      throw new GuardRejectedError('transition SHIPPED → TESTED not allowed', 'SHIPPED');
    },
  });
  strictEqual(await runQcPrintPass(ORG, 11, deps), 'failed');
  deepStrictEqual(calls, ['claim', 'printRecord', 'recordPass', 'markFailed', 'notifyFailed']);
  strictEqual(errors.markFailed, 'transition SHIPPED → TESTED not allowed');
});

test('a permanent error (unit gone) is FAILED on the first attempt', async () => {
  const { deps, calls } = fakes(row(), {
    printRecord: async () => {
      calls.push('printRecord');
      throw new QcPrintPassPermanentError('unit 2969 not found');
    },
  });
  strictEqual(await runQcPrintPass(ORG, 11, deps), 'failed');
  deepStrictEqual(calls, ['claim', 'printRecord', 'markFailed', 'notifyFailed']);
});

test('a failed notice does not change the FAILED outcome', async () => {
  const { deps, calls } = fakes(row(), {
    recordPass: async () => {
      throw new GuardRejectedError('transition SHIPPED → TESTED not allowed', 'SHIPPED');
    },
    notifyFailed: async () => {
      calls.push('notifyFailed');
      throw new Error('inbox down');
    },
  });
  strictEqual(await runQcPrintPass(ORG, 11, deps), 'failed');
  deepStrictEqual(calls, ['claim', 'printRecord', 'markFailed', 'notifyFailed']);
});

test('a DONE mark that fails releases the claim — the idempotent work re-runs', async () => {
  const { deps, calls } = fakes(row(), {
    markDone: async () => {
      calls.push('markDone');
      throw new Error('timeout');
    },
  });
  strictEqual(await runQcPrintPass(ORG, 11, deps), 'retry');
  deepStrictEqual(calls, ['claim', 'printRecord', 'recordPass', 'markDone', 'release']);
});
