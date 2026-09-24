/**
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/kiosk/linked-repair-line.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { KioskCartLine, RepairPayload } from './cart-line';
import { mapKioskCartToCounterParts } from './cart-to-counter';
import { collectKioskTriage } from './visit-triage';
import { repairDevicesFromLines } from './repair-devices';
import { cartLineIdentifiers } from './cart-card-view';
import {
  addLinkedRepair,
  linkedRepairLine,
  type LinkableRepairRecord,
  type LinkedRepairCart,
} from './linked-repair-line';

const RECORD: LinkableRepairRecord = {
  repairId: 4799,
  ticketNumber: '#9998',
  productTitle: 'Wave Radio CD',
  serialNumber: '0488AC',
  priceCents: 16800,
  customerName: 'Stephen Faesser',
  customerPhone: '714-271-2864',
};

function fakeCart(patch: Partial<LinkedRepairCart> = {}) {
  const added: Array<{ title: string; unitAmountCents: number; payload: RepairPayload }> = [];
  const customer: Array<{ phone?: string; name?: string }> = [];
  const cart: LinkedRepairCart = {
    lines: [],
    customerPhone: '',
    customerName: '',
    addRepair: (input) => added.push(input),
    setCustomer: (fields) => customer.push(fields),
    ...patch,
  };
  return { cart, added, customer };
}

function asLine(id = 'l1'): KioskCartLine {
  return { id, type: 'REPAIR', quantity: 1, ...linkedRepairLine(RECORD) };
}

describe('a linked repair line', () => {
  it('submits as linkedRepairs, never as a service to take in again', () => {
    const parts = mapKioskCartToCounterParts([asLine()]);
    assert.deepEqual(parts.linkedRepairs, [{ repairId: 4799 }]);
    assert.deepEqual(parts.services, []);
  });

  it('owes no serial, reason or signature — the visit can submit on a phone alone', () => {
    const triage = collectKioskTriage({
      lines: [{ ...asLine(), payload: { ...asLine().payload, serialNumber: '' } as RepairPayload }],
      customerPhone: '7142712864',
      customerName: '',
      customerEmail: '',
    });
    assert.deepEqual(
      triage.filter((item) => item.target === 'line'),
      [],
    );
    assert.equal(triage.some((item) => item.severity === 'block'), false);
  });

  it('never reaches the device stepper (Device & quote, paperwork, signature)', () => {
    assert.deepEqual(repairDevicesFromLines([asLine()]), []);
  });

  it('wears its ticket on the card in place of a service SKU', () => {
    assert.deepEqual(cartLineIdentifiers(asLine()).primary, { label: 'Linked', value: '#9998' });
  });

  it('carries an unquoted ticket as no price, not $0.00', () => {
    const line = linkedRepairLine({ ...RECORD, priceCents: null });
    assert.equal(line.payload.price, '');
    assert.equal(line.unitAmountCents, 0);
  });
});

describe('addLinkedRepair', () => {
  it('adds the line and takes the ticket customer when the visit has no phone yet', () => {
    const { cart, added, customer } = fakeCart();
    assert.equal(addLinkedRepair(RECORD, cart), 'added');
    assert.equal(added.length, 1);
    assert.equal(added[0]?.payload.linkedRepairId, 4799);
    assert.deepEqual(customer, [{ phone: '714-271-2864', name: 'Stephen Faesser' }]);
  });

  it('never overwrites a phone the operator already typed', () => {
    const { cart, customer } = fakeCart({ customerPhone: '5551234567' });
    addLinkedRepair(RECORD, cart);
    assert.deepEqual(customer, []);
  });

  it('refuses a twin — one ticket is charged once', () => {
    const { cart, added } = fakeCart({ lines: [asLine()] });
    assert.equal(addLinkedRepair(RECORD, cart), 'already');
    assert.deepEqual(added, []);
  });
});
