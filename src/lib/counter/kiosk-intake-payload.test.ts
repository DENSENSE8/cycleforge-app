import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKioskSalesIntakeBodyFromInput } from './kiosk-intake-payload';

const input = {
  customer: { phone: '5551234567', name: null, email: null, address: null },
  retailLines: [],
  services: [],
  priorOrder: null,
  ticketWork: { mode: 'none' as const },
};

test('step-up credentials ride the wire only as a PAIR', () => {
  const paired = buildKioskSalesIntakeBodyFromInput(input, {
    takePayment: true,
    staffId: 9,
    pin: '123456',
  });
  assert.equal(paired.staffId, 9);
  assert.equal(paired.pin, '123456');

  // A staff id without a PIN is not a step-up; sending it would claim an
  // attribution nobody proved.
  const unpaired = buildKioskSalesIntakeBodyFromInput(input, { takePayment: true, staffId: 9 });
  assert.equal(unpaired.staffId, undefined);
  assert.equal(unpaired.pin, undefined);
});

test('an absent device list is an empty list, never a missing key', () => {
  const body = buildKioskSalesIntakeBodyFromInput(
    { ...input, services: undefined },
    { takePayment: false },
  );
  // The wire carries a LIST of devices (`serviceLines`, SQ6); the builder
  // always emits it so the route never guesses what an absent key meant.
  assert.deepEqual(body.serviceLines, []);
});
