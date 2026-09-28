import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyerFromShipToSnapshot } from './order-buyer';

const snapshot = {
  name: 'Jane Doe',
  company: 'Acme',
  address1: '1 Main St',
  address2: 'Apt 2',
  city: 'Reno',
  state: 'NV',
  postalCode: '89501',
  country: 'US',
  phone: '775-555-0100',
};

test('a new buyer takes the ShipStation ship-to when the edit only touches contact', () => {
  assert.deepEqual(buyerFromShipToSnapshot(snapshot, { email: 'jane@example.com' }), {
    ok: true,
    input: {
      name: 'Jane Doe',
      phone: '775-555-0100',
      email: 'jane@example.com',
      shipTo: { address1: '1 Main St', address2: 'Apt 2', city: 'Reno', state: 'NV', postalCode: '89501', country: 'US' },
    },
  });
});

test('the edited ship-to and name replace the snapshot wholesale; an explicit null phone clears it', () => {
  const shipTo = { address1: '9 Oak Rd', address2: '', city: 'Sparks', state: 'NV', postalCode: '89431', country: 'US' };
  const out = buyerFromShipToSnapshot(snapshot, { name: 'Jane Roe', phone: null, shipTo });
  assert.deepEqual(out, { ok: true, input: { name: 'Jane Roe', phone: '', email: '', shipTo } });
});

test('no name anywhere is refused; a company-only snapshot names the buyer', () => {
  assert.equal(buyerFromShipToSnapshot(null, { phone: '775-555-0100' }).ok, false);
  const out = buyerFromShipToSnapshot({ company: 'Acme', name: '  ' }, { phone: '775-555-0100' });
  assert.equal(out.ok && out.input.name, 'Acme');
});
