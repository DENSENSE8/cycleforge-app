import test from 'node:test';
import assert from 'node:assert/strict';
import { customerBillToLines, customerPlace, type CustomerRecord } from './customer-display';

function customer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 1,
    display_name: 'Dana Vo',
    customer_name: null,
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    mobile: null,
    shipping_address_1: '999 Colorado St',
    shipping_address_2: 'Apt B',
    shipping_city: 'Eagle Pass',
    shipping_state: 'TX',
    shipping_postal_code: '78852',
    shipping_country: 'US',
    billing_address: {},
    ...overrides,
  };
}

test('bill-to is absent when the book has none (the writer stores {})', () => {
  assert.deepEqual(customerBillToLines(customer()), []);
  assert.deepEqual(customerBillToLines(customer({ billing_address: null })), []);
});

test('bill-to that repeats the ship-to (any case) is not a second fact', () => {
  const same = customer({
    billing_address: {
      address1: '999 COLORADO ST',
      address2: 'APT B',
      city: 'EAGLE PASS',
      state: 'TX',
      postalCode: '78852',
      country: 'US',
    },
  });
  assert.deepEqual(customerBillToLines(same), []);
});

test('a different bill-to reads as its own address lines', () => {
  const other = customer({
    billing_address: { address1: '1 Main St', city: 'Austin', state: 'TX', postalCode: '73301', country: null },
  });
  assert.deepEqual(customerBillToLines(other), ['1 Main St', 'Austin TX 73301']);
});

test('row place: city, state — the country only when it is not domestic', () => {
  assert.equal(customerPlace(customer()), 'Eagle Pass, TX');
  assert.equal(
    customerPlace(customer({ shipping_city: 'Toronto', shipping_state: 'ON', shipping_country: 'CA' })),
    'Toronto, ON, CA',
  );
  assert.equal(customerPlace(customer({ shipping_city: null, shipping_state: null, shipping_country: null })), '');
});
