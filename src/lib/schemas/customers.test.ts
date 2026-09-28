import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CustomerContactPatchBody, OrderBuyerPatchBody, customerContactColumns, type CustomerContactColumns } from './customers';

const row: CustomerContactColumns = {
  customer_name: 'Jane Doe',
  display_name: 'Jane Doe',
  first_name: 'Jane',
  last_name: 'Doe',
  phone: '555-123-4567',
  email: null,
};

test('a name change writes all four name columns, so the stale display_name cannot keep winning', () => {
  assert.deepEqual(customerContactColumns(row, { name: 'Jane Q Roe' }), {
    ok: true,
    columns: { display_name: 'Jane Q Roe', customer_name: 'Jane Q Roe', last_name: 'Q Roe' },
  });
});

test('values equal to the stored row write nothing', () => {
  assert.deepEqual(customerContactColumns(row, { name: 'Jane Doe', phone: '555-123-4567', email: '' }), {
    ok: true,
    columns: {},
  });
});

test('blank phone clears the column to NULL', () => {
  assert.deepEqual(customerContactColumns(row, { phone: '' }), { ok: true, columns: { phone: null } });
});

test('first/last alone rebuild the display name; a pair that merges to nothing is refused', () => {
  assert.deepEqual(customerContactColumns(row, { lastName: 'Roe' }), {
    ok: true,
    columns: { customer_name: 'Jane Roe', display_name: 'Jane Roe', last_name: 'Roe' },
  });
  assert.deepEqual(customerContactColumns(row, { firstName: '', lastName: '' }), {
    ok: false,
    error: 'Name cannot be blank',
  });
});

test('the body refuses an empty patch, unknown keys and a too-short phone', () => {
  assert.equal(CustomerContactPatchBody.safeParse({}).success, false);
  assert.equal(CustomerContactPatchBody.safeParse({ address: 'x' }).success, false);
  assert.equal(CustomerContactPatchBody.safeParse({ phone: '12345' }).success, false);
  assert.equal(CustomerContactPatchBody.safeParse({ phone: '(555) 123-4567' }).success, true);
});

test('an order buyer patch needs a field, refuses unknown keys, and a ship-to needs street + city', () => {
  assert.equal(OrderBuyerPatchBody.safeParse({}).success, false);
  assert.equal(OrderBuyerPatchBody.safeParse({ firstName: 'Jane' }).success, false);
  assert.equal(OrderBuyerPatchBody.safeParse({ shipTo: { address1: '1 Main St' } }).success, false);
  assert.equal(OrderBuyerPatchBody.safeParse({ shipTo: { city: 'Reno' } }).success, false);
  assert.equal(OrderBuyerPatchBody.safeParse({ shipTo: { address1: '1 Main St', city: 'Reno', zip: '1' } }).success, false);
  const ok = OrderBuyerPatchBody.safeParse({ shipTo: { address1: ' 1 Main St ', city: 'Reno' } });
  assert.deepEqual(ok.success && ok.data.shipTo, {
    address1: '1 Main St',
    address2: '',
    city: 'Reno',
    state: '',
    postalCode: '',
    country: '',
  });
});

test('an order buyer patch accepts a lone blank email (clears it) but not a blank name', () => {
  assert.equal(OrderBuyerPatchBody.safeParse({ email: '' }).success, true);
  assert.equal(OrderBuyerPatchBody.safeParse({ name: '  ' }).success, false);
});
