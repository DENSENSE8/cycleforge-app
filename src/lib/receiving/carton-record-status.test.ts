/**
 * Run: `node --test --import tsx src/lib/receiving/carton-record-status.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { deriveCartonAlerts, deriveCartonSteps, type CartonStep } from './carton-record-status';
import type { ReceivingLineRow } from './receiving-line-row';

function line(partial: Partial<ReceivingLineRow> & { id: number }): ReceivingLineRow {
  return {
    receiving_id: 10,
    tracking_number: null,
    carrier: null,
    zoho_purchaseorder_number: 'PO-1',
    receiving_source: 'zoho_po',
    quantity_received: 1,
    quantity_expected: 1,
    workflow_status: null,
    needs_test: false,
    ...partial,
  } as ReceivingLineRow;
}

const byKey = (steps: readonly CartonStep[]): Partial<Record<CartonStep['key'], CartonStep>> =>
  Object.fromEntries(steps.map((step) => [step.key, step]));

describe('deriveCartonSteps', () => {
  test('a received carton never reports an earlier step as still to do', () => {
    const steps = byKey(
      deriveCartonSteps({ id: 10, received_at: '2026-09-25 11:52:25', received_by_name: 'David' }, [
        line({ id: 1, received_done_at: '2026-09-25T18:52:25Z' }),
      ]),
    );
    assert.equal(steps.received?.state, 'done');
    assert.equal(steps.received?.who, 'David');
    assert.equal(steps.unboxed?.state, 'unrecorded');
    assert.equal(steps.scanned?.state, 'unrecorded');
    assert.equal(steps.graded?.state, 'unrecorded');
    assert.equal(steps.labels?.state, 'todo');
  });

  test('per-line steps fold to the carton as k/N, with the latest stamp', () => {
    const steps = byKey(
      deriveCartonSteps({ id: 10, tracking_scanned_at: '2026-09-25 10:51:51', tracking_scanned_by_name: 'David' }, [
        line({ id: 1, condition_graded_at: '2026-09-25T17:00:00Z' }),
        line({ id: 2, condition_graded_at: '2026-09-25T18:00:00Z' }),
        line({ id: 3 }),
      ]),
    );
    assert.equal(steps.scanned?.state, 'done');
    assert.equal(steps.graded?.state, 'partial');
    assert.equal(steps.graded?.detail, '2/3');
    assert.equal(steps.graded?.at, '2026-09-25T18:00:00Z');
  });

  test('steps that do not apply are not painted', () => {
    const keys = deriveCartonSteps({ id: 10 }, [line({ id: -5 })]).map((step) => step.key);
    // A placeholder row (no receiving_line) has no item work; nothing delivered,
    // staged, tested or put away was ever recorded.
    assert.deepEqual(keys, ['scanned', 'unboxed', 'received']);
  });

  test('test step counts only lines that need or had a test', () => {
    const steps = byKey(
      deriveCartonSteps({ id: 10 }, [
        line({ id: 1, needs_test: true, tested_count: 1 }),
        line({ id: 2, needs_test: true }),
        line({ id: 3 }),
      ]),
    );
    assert.equal(steps.tested?.state, 'partial');
    assert.equal(steps.tested?.detail, '1/2');
    assert.equal(steps.tested?.at, null);
  });
});

describe('deriveCartonAlerts', () => {
  test('unfound, wrong destination and claim tickets are loud', () => {
    const keys = deriveCartonAlerts({ id: 10 }, [
      line({ id: 1, receiving_source: 'unmatched', zoho_purchaseorder_number: null, wrong_destination: true, zendesk_ticket: '#123' }),
    ], null).map((alert) => `${alert.key}:${alert.tone}`);
    assert.deepEqual(keys, ['unfound:danger', 'wrong-destination:danger', 'claim:warning']);
  });

  test('a paired, clean carton has no alerts', () => {
    assert.deepEqual(deriveCartonAlerts({ id: 10 }, [line({ id: 1 })], 'PO-1'), []);
  });
});
