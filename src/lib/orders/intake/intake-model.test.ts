/**
 * Intake blockers per shipping mode — a pickup never waits on tracking, a
 * label or a ship-to; the create body tells the server it is a pickup.
 * Run: npx tsx --test src/lib/orders/intake/intake-model.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyIntake, intakeBlockers, intakeCreateBody, newIntakeLine, shipToRequired, testOrderFill, type IntakeState } from './intake-model';

const ready = (over: Partial<IntakeState> = {}): IntakeState => ({
  ...emptyIntake('manual'),
  customer: { id: 7, name: 'Walk In', phone: '', email: '', shipTo: { address1: '', address2: '', city: '', state: '', postalCode: '', country: 'US' } },
  lines: [newIntakeLine({ skuCatalogId: 741, sku: 'BOSE-151', title: 'Bose 151', unitPrice: '39.00' })],
  orderNumber: 'PH-000124',
  channel: 'Phone',
  ...over,
});

test('release blockers per mode: elsewhere needs tracking, buy needs the saved order, pickup needs neither', () => {
  assert.deepEqual(intakeBlockers(ready({ shippingMode: 'elsewhere' }), 'release'), ['Tracking number missing']);
  assert.deepEqual(intakeBlockers(ready({ shippingMode: 'elsewhere', trackingNumber: '9400108106245603001206' }), 'release'), []);
  assert.equal(intakeBlockers(ready({ shippingMode: 'buy' }), 'release').length, 1);
  assert.deepEqual(intakeBlockers(ready({ shippingMode: 'pickup' }), 'release'), []);
});

test('pickup still blocks on the things that are not shipping', () => {
  const blockers = intakeBlockers(ready({ shippingMode: 'pickup', orderNumber: '', lines: [newIntakeLine({ title: 'Loose part' })] }), 'release');
  assert.deepEqual(blockers, ['Order number missing', 'Line 1 is not a catalog product']);
});

test('ship-to is required unless the customer collects it', () => {
  assert.equal(shipToRequired(ready({ shippingMode: 'pickup' })), false);
  assert.equal(shipToRequired(ready({ shippingMode: 'elsewhere' })), true);
  assert.equal(shipToRequired(ready({ shippingMode: 'buy' })), true);
});

test('the create body names the fulfilment and never carries a stale tracking number for a pickup', () => {
  const pickup = intakeCreateBody(ready({ shippingMode: 'pickup', trackingNumber: '9400108106245603001206' }));
  assert.equal(pickup.fulfillment, 'pickup');
  assert.deepEqual(pickup.shippingTrackingNumbers, []);
  const shipped = intakeCreateBody(ready({ shippingMode: 'elsewhere', trackingNumber: '9400108106245603001206' }));
  assert.equal(shipped.fulfillment, 'ship');
  assert.deepEqual(shipped.shippingTrackingNumbers, ['9400108106245603001206']);
});

test('the test fill leaves nothing blocking release, and keeps the drawn order number', () => {
  const drawn = { ...emptyIntake('manual'), orderNumber: 'PH-000124', channel: '' };
  const product = { skuCatalogId: 741, sku: 'BOSE-151', title: 'Bose 151', imageUrl: null, onHand: 3, bin: 'A1', suggestedUnitCents: null };
  const filled = testOrderFill(drawn, product, '2026-09-27');
  assert.deepEqual(intakeBlockers(filled, 'release'), []);
  assert.equal(filled.orderNumber, 'PH-000124');
  assert.equal(intakeCreateBody(filled).fulfillment, 'pickup');
  assert.equal(filled.lines[0]!.condition, 'REFURBISHED');
});
