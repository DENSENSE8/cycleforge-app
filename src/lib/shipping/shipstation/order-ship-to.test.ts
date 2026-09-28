import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickOrderShipTo } from './order-ship-to';
import type { ShipAddress } from './types';

const address = (line1: string): ShipAddress => ({
  name: 'Jane Doe',
  phone: null,
  company: null,
  addressLine1: line1,
  addressLine2: null,
  cityLocality: 'Reno',
  stateProvince: 'NV',
  postalCode: '89501',
  countryCode: 'US',
  residential: true,
});
const shipStation = address('1 Typo St');
const corrected = address('1 Main St');
const orderCreatedAt = new Date('2026-09-20T10:00:00Z');

test('without a staff correction ShipStation wins, and the customer tier is only the fallback', () => {
  assert.equal(pickOrderShipTo(shipStation, { shipTo: corrected, editedAt: null, orderCreatedAt }), shipStation);
  assert.equal(pickOrderShipTo(null, { shipTo: corrected, editedAt: null, orderCreatedAt }), corrected);
});

test('a correction made at or after the order was created wins over ShipStation', () => {
  assert.equal(pickOrderShipTo(shipStation, { shipTo: corrected, editedAt: orderCreatedAt, orderCreatedAt }), corrected);
  assert.equal(
    pickOrderShipTo(shipStation, { shipTo: corrected, editedAt: new Date('2026-09-27T00:00:00Z'), orderCreatedAt }),
    corrected,
  );
});

test('an older correction never overrides a later order, and an unusable stored address never wins', () => {
  const edited = new Date('2026-09-20T09:59:59Z');
  assert.equal(pickOrderShipTo(shipStation, { shipTo: corrected, editedAt: edited, orderCreatedAt }), shipStation);
  assert.equal(pickOrderShipTo(shipStation, { shipTo: null, editedAt: new Date(), orderCreatedAt }), shipStation);
});
