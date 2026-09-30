import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveryPromiseFace } from './delivery-promise';

const TODAY = '2026-09-27';

test('no facts → no promise', () => {
  assert.equal(deliveryPromiseFace({ estimatedDeliveryAt: null, deliveredAt: null }, TODAY), null);
});

test('estimate ahead reads as the arrival day, on time', () => {
  const face = deliveryPromiseFace({ estimatedDeliveryAt: '2026-09-30 12:00:00+00', deliveredAt: null }, TODAY);
  assert.deepEqual(face, { kind: 'arrives', label: 'Arrives Wed, Sep 30', dateKey: '2026-09-30', late: false });
});

test('estimate is today → not late yet', () => {
  assert.equal(deliveryPromiseFace({ estimatedDeliveryAt: '2026-09-27T20:00:00Z', deliveredAt: null }, TODAY)?.late, false);
});

test('estimate passed undelivered → late', () => {
  const face = deliveryPromiseFace({ estimatedDeliveryAt: '2026-09-26T20:00:00Z', deliveredAt: null }, TODAY);
  assert.equal(face?.kind, 'arrives');
  assert.equal(face?.late, true);
});

test('estimate day is the Pacific calendar day, not UTC', () => {
  // 03:00Z on Oct 1 is still Sep 30 in Los Angeles.
  assert.equal(deliveryPromiseFace({ estimatedDeliveryAt: '2026-10-01T03:00:00Z', deliveredAt: null }, TODAY)?.dateKey, '2026-09-30');
});

test('delivered wins over any estimate', () => {
  const face = deliveryPromiseFace({ estimatedDeliveryAt: '2026-09-20T20:00:00Z', deliveredAt: '2026-09-19T20:00:00Z' }, TODAY);
  assert.deepEqual(face, { kind: 'delivered', label: 'Delivered Sep 19', dateKey: '2026-09-19', late: false });
});

test('delivered after the estimate → late', () => {
  const face = deliveryPromiseFace({ estimatedDeliveryAt: '2026-09-18T20:00:00Z', deliveredAt: '2026-09-19T20:00:00Z' }, TODAY);
  assert.equal(face?.late, true);
});

test('delivered flag without an instant and no estimate → nothing to say', () => {
  assert.equal(deliveryPromiseFace({ estimatedDeliveryAt: null, deliveredAt: null, isDelivered: true }, TODAY), null);
});

test('a stale estimate on a delivered parcel with no instant is not "late"', () => {
  assert.equal(deliveryPromiseFace({ estimatedDeliveryAt: '2026-09-01T20:00:00Z', deliveredAt: null, isDelivered: true }, TODAY), null);
});
