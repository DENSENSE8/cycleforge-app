/**
 * repairStepGates — the kiosk progress contract (PG6).
 *
 * The header's segments and count come from these gates, so what they must
 * defend is: a satisfied unit counts wherever the pointer is, and un-editing
 * a unit takes its segment back.
 *
 *   npx tsx --test src/components/repair/repair-step-gates.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialFormData, repairStepGates } from './repair-intake-logic';

function filled(overrides: Parameters<typeof buildInitialFormData>[0] = {}) {
  return buildInitialFormData({
    product: { type: 'Speaker', model: 'Bose 321', sourceSku: null },
    repairReasons: ['No power'],
    serialNumber: 'SN-1',
    price: '86.00',
    customer: { name: 'Ada', phone: '5551234567', email: '' },
    ...overrides,
  });
}

test('an empty form has no satisfied units', () => {
  assert.deepEqual(repairStepGates(buildInitialFormData(), false), [false, false, false]);
});

test('notes alone satisfy the issue unit — the domain predicate, not just chips', () => {
  const data = buildInitialFormData({ repairNotes: 'Crackling on the left channel' });
  assert.equal(repairStepGates(data, false)[0], true);
});

test('the information unit needs BOTH a serial and a reachable phone', () => {
  const noSerial = filled({ serialNumber: '' });
  const shortPhone = filled({ customer: { name: 'Ada', phone: '555', email: '' } });
  assert.equal(repairStepGates(noSerial, false)[1], false);
  assert.equal(repairStepGates(shortPhone, false)[1], false);
  assert.equal(repairStepGates(filled(), false)[1], true);
});

test('authorization is the submit gate — it needs the signature', () => {
  assert.equal(repairStepGates(filled(), false)[2], false);
  assert.equal(repairStepGates(filled(), true)[2], true);
});

test('a satisfied unit counts regardless of which step is on screen (PG6)', () => {
  // The pointer is not an input here — the caller passes no step at all, which
  // is the whole point: progression cannot read as 3/3 because someone paged
  // to the last step with an empty form.
  const onlyIssue = buildInitialFormData({ repairReasons: ['Screen'] });
  assert.equal(repairStepGates(onlyIssue, false).filter(Boolean).length, 1);
  assert.equal(repairStepGates(filled(), true).filter(Boolean).length, 3);
});

test('clearing an earlier unit takes its segment back', () => {
  const complete = filled();
  assert.equal(repairStepGates(complete, true).filter(Boolean).length, 3);
  const issueCleared = { ...complete, repairReasons: [], repairNotes: '' };
  // Issue drops AND authorization drops with it (submit needs the issue).
  assert.deepEqual(repairStepGates(issueCleared, true), [false, true, false]);
});
