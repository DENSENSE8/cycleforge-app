import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReceivingUnitStageFactView } from './receiving-line-row';
import { summarizeReceivingUnitStages } from './receiving-unit-stage-summary';

function fact(
  id: number,
  patch: Partial<ReceivingUnitStageFactView> = {},
): ReceivingUnitStageFactView {
  return {
    receiving_line_unit_id: id,
    receiving_line_id: 10,
    receiving_id: 20,
    ordinal: id,
    serial_unit_id: id + 100,
    unit_uid: `UNIT-${id}`,
    serial: null,
    condition_grade: 'USED_A',
    triage_state: 'TRIAGED',
    label_state: 'PRINTED',
    qc_state: 'PASSED',
    latest_verdict: 'PASS',
    tested_at: '2026-09-29T10:00:00.000Z',
    tested_by: 1,
    tested_by_name: 'Tester',
    primary_support_ticket_id: null,
    updated_at: '2026-09-29T10:00:01.000Z',
    ...patch,
  };
}

test('summary includes pre-materialized expected units as pending work', () => {
  const summary = summarizeReceivingUnitStages([{ quantity: 3, unitStageFacts: [fact(1)] }]);
  assert.deepEqual(
    { units: summary.units, passed: summary.passed, pending: summary.pending, next: summary.nextAction },
    { units: 3, passed: 1, pending: 2, next: 'Triage' },
  );
  assert.equal(summary.compact, '3 units · 1 passed · 2 pending');
});

test('workflow next action is triage, label, failure, pending, retest, then put away', () => {
  assert.equal(summarizeReceivingUnitStages([{ quantity: 1, unitStageFacts: [fact(1, { triage_state: 'NOT_STARTED' })] }]).nextAction, 'Triage');
  assert.equal(summarizeReceivingUnitStages([{ quantity: 1, unitStageFacts: [fact(1, { label_state: 'MISSING' })] }]).nextAction, 'Print labels');
  assert.equal(summarizeReceivingUnitStages([{ quantity: 1, unitStageFacts: [fact(1, { qc_state: 'FAILED' })] }]).nextAction, 'Resolve failure');
  assert.equal(summarizeReceivingUnitStages([{ quantity: 1, unitStageFacts: [fact(1, { qc_state: 'PENDING' })] }]).nextAction, 'Test');
  assert.equal(summarizeReceivingUnitStages([{ quantity: 1, unitStageFacts: [fact(1, { qc_state: 'TEST_AGAIN' })] }]).nextAction, 'Retest');
  assert.equal(summarizeReceivingUnitStages([{ quantity: 1, unitStageFacts: [fact(1)] }]).nextAction, 'Put away');
});

test('failed outranks pending, pending outranks retest, and tickets de-duplicate', () => {
  const summary = summarizeReceivingUnitStages([{
    quantity: 3,
    unitStageFacts: [
      fact(1, { qc_state: 'TEST_AGAIN', primary_support_ticket_id: 900 }),
      fact(2, { qc_state: 'PENDING', primary_support_ticket_id: 900 }),
      fact(3, { qc_state: 'FAILED', primary_support_ticket_id: 901 }),
    ],
  }]);
  assert.equal(summary.strongestQc, 'FAILED');
  assert.equal(summary.tickets, 2);
});
