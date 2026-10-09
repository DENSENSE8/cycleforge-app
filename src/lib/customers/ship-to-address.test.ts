import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_SHIP_TO,
  decodeShipToAddress,
  encodeShipToAddress,
  formatShipToOneLine,
} from './ship-to-address';

const full = {
  address1: '12 Main St',
  address2: 'Apt 4',
  city: 'Springfield',
  state: 'IL',
  postalCode: '62701',
};

test('every field survives the session string, including a blank street', () => {
  assert.deepEqual(decodeShipToAddress(encodeShipToAddress(full)), full);
  const noStreet = { ...EMPTY_SHIP_TO, city: 'Springfield', postalCode: '62701' };
  assert.deepEqual(decodeShipToAddress(encodeShipToAddress(noStreet)), noStreet);
});

test('a blank address is the empty string, so the visit reads as "no address"', () => {
  assert.equal(encodeShipToAddress({ ...EMPTY_SHIP_TO, city: '   ' }), '');
  assert.deepEqual(decodeShipToAddress(''), EMPTY_SHIP_TO);
});

test('an address typed before the fields existed reads as the street line', () => {
  assert.deepEqual(decodeShipToAddress('1 Mill St, Boston'), { ...EMPTY_SHIP_TO, address1: '1 Mill St, Boston' });
  assert.deepEqual(decodeShipToAddress('{not json'), { ...EMPTY_SHIP_TO, address1: '{not json' });
});

test('printed on one line: street, unit, then the city line', () => {
  assert.equal(formatShipToOneLine(full), '12 Main St, Apt 4, Springfield IL 62701');
  assert.equal(formatShipToOneLine({ ...EMPTY_SHIP_TO, city: 'Springfield' }), 'Springfield');
});
