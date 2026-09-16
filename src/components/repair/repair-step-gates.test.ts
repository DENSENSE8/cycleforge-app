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
  assert.deepEqual(repairStepGates(buildInitialFormData(), false, false), [
    false,
    false,
    false,
    false,
  ]);
});

test('notes alone satisfy the issue unit — the domain predicate, not just chips', () => {
  const data = buildInitialFormData({ repairNotes: 'Crackling on the left channel' });
  assert.equal(repairStepGates(data, false, false)[0], true);
});

/**
 * DEVICE and CONTACT are separate units as of 2026-09-15. Operator: *"there
 * should be contact information just as phone number name email address and
 * address with serial number and price under a different stepper."* Before
 * that, one gate demanded a serial AND a phone, so a staffer who had the
 * device in hand but no customer details yet could not advance past either.
 */
test('the device unit needs a serial and a price, and nothing about the customer', () => {
  const noSerial = filled({ serialNumber: '' });
  const noPrice = filled({ price: '' });
  const noPhone = filled({ customer: { name: 'Ada', phone: '', email: '' } });
  assert.equal(repairStepGates(noSerial, false, false)[1], false);
  assert.equal(repairStepGates(noPrice, false, false)[1], false);
  assert.equal(repairStepGates(noPhone, false, false)[1], true, 'a phone is not a device fact');
  assert.equal(repairStepGates(filled(), false, false)[1], true);
});

test('the contact unit is the phone alone — name and email never gate it', () => {
  const shortPhone = filled({ customer: { name: 'Ada', phone: '555', email: '' } });
  const anonymous = filled({ customer: { name: '', phone: '5551234567', email: '' } });
  assert.equal(repairStepGates(shortPhone, false, false)[2], false);
  assert.equal(repairStepGates(anonymous, false, false)[2], true);
  assert.equal(
    repairStepGates(filled({ serialNumber: '' }), false, false)[2],
    true,
    'not a device gate',
  );
});

/**
 * AUTHORIZATION is the signature AND a settled ticket question (2026-09-15).
 *
 * The create-or-link question was briefly a fifth unit; the operator collapsed
 * it under the signature — *"would it be best to include a slider … below the
 * signature so it would be mounted under one step?"* — so the last unit now
 * demands both. SETTLED, not answered: the slider auto-selects Create, so the
 * caller passes `true` for an untouched visit and `false` only for the
 * half-finished link (see `isKioskTicketChoiceSettled`). Either half missing
 * leaves the segment empty and the commit key refused.
 */
test('authorization needs the signature AND a settled ticket question', () => {
  assert.equal(repairStepGates(filled(), false, false)[3], false, 'neither');
  assert.equal(repairStepGates(filled(), true, false)[3], false, 'signed, link unfinished');
  assert.equal(repairStepGates(filled(), false, true)[3], false, 'settled but unsigned');
  assert.equal(repairStepGates(filled(), true, true)[3], true);
});

test('a satisfied unit counts regardless of which step is on screen (PG6)', () => {
  // The pointer is not an input here — the caller passes no step at all, which
  // is the whole point: progression cannot read as 4/4 because someone paged
  // to the last step with an empty form.
  const onlyIssue = buildInitialFormData({ repairReasons: ['Screen'] });
  assert.equal(repairStepGates(onlyIssue, false, false).filter(Boolean).length, 1);
  assert.equal(
    repairStepGates(onlyIssue, false, true).filter(Boolean).length,
    1,
    'a ticket decision alone fills nothing',
  );
  assert.equal(repairStepGates(filled(), true, true).filter(Boolean).length, 4);
});

test('clearing an earlier unit takes its segment back', () => {
  const complete = filled();
  assert.equal(repairStepGates(complete, true, true).filter(Boolean).length, 4);
  const issueCleared = { ...complete, repairReasons: [], repairNotes: '' };
  // Issue drops AND authorization drops with it (submit needs the issue);
  // device and contact are untouched by it.
  assert.deepEqual(repairStepGates(issueCleared, true, true), [false, true, true, false]);
});
