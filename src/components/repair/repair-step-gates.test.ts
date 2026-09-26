/**
 * repairStepGates — the kiosk progress contract (PG6).
 *
 * The header's segments and count come from these gates, so what they must
 * defend is: a satisfied unit counts wherever the pointer is, and un-editing
 * a unit takes its segment back.
 *
 * ## TWO ARMS since 2026-09-16
 *
 * Called WITHOUT a device list — the staff single-intake form — the form's own
 * singular `serialNumber` + `price` are the device facts, byte-identical to
 * before. Called WITH one — the kiosk, which holds one cart line per unit on
 * the counter — every device answers for itself and the form's singular fields
 * are not consulted at all. The old single check passed a four-device visit on
 * the strength of device one's serial and wrote the other three blank; that is
 * the defect this file now pins shut.
 *
 *   npx tsx --test src/components/repair/repair-step-gates.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialFormData,
  canSubmitRepairIntake,
  getRepairSubmitBlockReason,
  repairStepGates,
  type RepairDeviceGateRow,
} from './repair-intake-logic';
import type { KioskCartLine } from '@/lib/kiosk/cart-line';
import { repairDevicesFromLines } from '@/lib/kiosk/repair-devices';

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

/**
 * The KIOSK's form: satisfied on every VISIT fact and empty on both device
 * fields and on reasons, because on that surface the device facts — reasons
 * included since 2026-09-25 — live on the cart line that will be written.
 * Anything these tests get right about it is only meaningful because the form
 * itself carries no serial, no quote and no reason.
 */
function visitForm(overrides: Parameters<typeof buildInitialFormData>[0] = {}) {
  return filled({
    product: { type: '', model: '', sourceSku: null },
    repairReasons: [],
    serialNumber: '',
    price: '',
    ...overrides,
  });
}

/** One device as `repair-devices.ts` hands it over — serialised, quoted, answered. */
function device(overrides: Partial<RepairDeviceGateRow> = {}): RepairDeviceGateRow {
  return {
    title: 'Wave Radio II',
    serialNumber: 'SN-1',
    price: '86.00',
    repairReasons: ['No power'],
    ...overrides,
  };
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
test('the staff arm: the device unit needs a serial and a price, and nothing about the customer', () => {
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

/**
 * THE per-device arm. A customer can hand over several units and each one
 * becomes its own `repair_service` row with its own serial and its own quote,
 * so the gate has to ask all of them.
 */
test('the device unit asks EVERY device, never just the first', () => {
  const form = visitForm();
  const both = [device(), device({ title: 'Wave Radio III', serialNumber: 'SN-2' })];
  const secondUnserialised = [device(), device({ title: 'Wave Radio III', serialNumber: '' })];
  const secondUnquoted = [device(), device({ title: 'Wave Radio III', price: '' })];
  assert.equal(repairStepGates(form, false, false, both)[1], true);
  assert.equal(
    repairStepGates(form, false, false, secondUnserialised)[1],
    false,
    "device one's serial is not device two's",
  );
  assert.equal(repairStepGates(form, false, false, secondUnquoted)[1], false);
});

/**
 * An EMPTY list is a visit with no device on it, not "nothing to check". The
 * permissive reading would let a signed agreement for zero devices submit.
 */
test('an empty device list refuses the device unit and the commit', () => {
  const form = visitForm();
  assert.equal(repairStepGates(form, true, true, [])[1], false);
  assert.equal(canSubmitRepairIntake(form, true, []), false);
  assert.equal(
    getRepairSubmitBlockReason(form, true, []),
    'Add the device being dropped off',
  );
});

/**
 * The kiosk form carries NO serial, NO price and NO product, because the cart
 * owns all three per device. This is the regression that matters most: while
 * `canSubmitRepairIntake` still asked `CONTACT_FIELDS`' legacy `extras` entry
 * (the form's own singular serial + price) of a device-list caller, "Submit
 * repair" was disabled forever with nothing on screen to fix.
 */
test('with devices, the form needs no serial, price or product of its own', () => {
  const form = visitForm();
  assert.equal(canSubmitRepairIntake(form, true, [device()]), true);
  assert.equal(repairStepGates(form, true, true, [device()]).filter(Boolean).length, 4);
  assert.equal(
    getRepairSubmitBlockReason(form, true, [device()]),
    undefined,
    'nothing left to refuse',
  );
  assert.equal(
    canSubmitRepairIntake(form, true),
    false,
    'the staff arm still demands the form fill them in',
  );
});

test('the refusal names WHICH device is short once there is more than one', () => {
  assert.equal(
    getRepairSubmitBlockReason(visitForm(), true, [
      device(),
      device({ title: 'Acoustic Wave', price: '' }),
    ]),
    'Acoustic Wave still needs its price',
  );
  // One device on the counter: naming it would be noise beside the one card.
  assert.equal(
    getRepairSubmitBlockReason(visitForm(), true, [device({ serialNumber: '', price: '' })]),
    'Serial number and price required to submit',
  );
});

/**
 * REASONS are per unit since 2026-09-25 (operator: "all devices, or per device
 * with a switcher"). Each unit is its own `repair_service` row whose `issue`
 * is that unit's reasons, and the counter refuses a row with neither a reason
 * nor notes (`missingRepairIntakeFields`) — so one answered unit must not
 * carry the other through.
 */
test('the reason unit asks EVERY device; visit notes answer for all of them', () => {
  const answered = device();
  const blank = device({ title: 'Acoustimass 6', repairReasons: [] });

  assert.equal(repairStepGates(visitForm(), false, false, [answered, blank])[0], false);
  assert.equal(canSubmitRepairIntake(visitForm(), true, [answered, blank]), false);
  assert.equal(
    getRepairSubmitBlockReason(visitForm(), true, [answered, blank]),
    'Acoustimass 6 still needs a reason for repair',
  );

  const notes = visitForm({ repairNotes: 'Both crackle on the left channel' });
  assert.equal(repairStepGates(notes, false, false, [answered, blank])[0], true);

  assert.equal(
    repairStepGates(visitForm(), false, false, [answered, device({ title: 'Acoustimass 6', repairReasons: ['Buzzing'] })])[0],
    true,
  );
  assert.equal(
    repairStepGates(visitForm({ repairReasons: ['No power'] }), false, false, [blank])[0],
    false,
    "the form's own reasons do not answer for a unit",
  );
});

/**
 * A LINKED repair was taken in (and given its reason) when its ticket was
 * written; the reason gate must neither ask it nor count it. The rows come
 * from the cart through `repairDevicesFromLines`, the one source every gate
 * reads.
 */
test('a linked repair on the cart never gates the reason unit', () => {
  const lines: KioskCartLine[] = [
    {
      id: 'a',
      type: 'REPAIR',
      title: 'Wave Radio II',
      quantity: 1,
      unitAmountCents: 8600,
      payload: { productModel: 'Wave Radio II', serialNumber: 'SN-1', price: '86.00', repairReasons: ['No power'] },
    },
    {
      id: 'linked',
      type: 'REPAIR',
      title: 'QC35 II',
      quantity: 1,
      unitAmountCents: 0,
      payload: { productModel: 'QC35 II', serialNumber: 'SN-9', price: '0', linkedRepairId: 4411 },
    },
  ];
  assert.equal(repairStepGates(visitForm(), false, false, repairDevicesFromLines(lines))[0], true);
});
