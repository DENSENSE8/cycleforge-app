import test from 'node:test';
import assert from 'node:assert/strict';
import { isShipFromComplete, parseShipFromInput } from './ship-from-settings';

const full = {
  name: ' Warehouse ',
  company: 'USAV',
  phone: '555-555-5555',
  addressLine1: '123 Main St',
  addressLine2: '',
  city: 'Los Angeles',
  state: 'ca',
  postalCode: '90001',
  country: 'us',
};

test('parseShipFromInput: a complete address is trimmed and upper-cased', () => {
  const r = parseShipFromInput(full);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.empty, false);
  assert.equal(r.value.name, 'Warehouse');
  assert.equal(r.value.state, 'CA');
  assert.equal(r.value.country, 'US');
  assert.equal(isShipFromComplete(r.value), true);
});

test('parseShipFromInput: all-empty clears (env fallback applies)', () => {
  const r = parseShipFromInput({ addressLine1: '  ', city: '', state: '', postalCode: '' });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.empty, true);
});

test('parseShipFromInput: half-filled is refused, naming what is missing', () => {
  const r = parseShipFromInput({ addressLine1: '123 Main St', city: 'LA' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /state, ZIP/);
});

test('parseShipFromInput: over-long fields and bad country are refused', () => {
  assert.equal(parseShipFromInput({ ...full, addressLine1: 'x'.repeat(121) }).ok, false);
  assert.equal(parseShipFromInput({ ...full, country: 'USA' }).ok, false);
  assert.equal(parseShipFromInput('nope').ok, false);
});
