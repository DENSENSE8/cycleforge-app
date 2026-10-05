import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePickupCarrier, pickupCutoffsForDay, type PickupCutoffRow } from './pickup-cutoffs-shared';

test('normalizePickupCarrier is UPPER(BTRIM(carrier)), blank → null', () => {
  assert.equal(normalizePickupCarrier('  usps '), 'USPS');
  assert.equal(normalizePickupCarrier('FedEx'), 'FEDEX');
  assert.equal(normalizePickupCarrier('dhl_express'), 'DHL_EXPRESS');
  assert.equal(normalizePickupCarrier('   '), null);
  assert.equal(normalizePickupCarrier(''), null);
  assert.equal(normalizePickupCarrier(null), null);
  assert.equal(normalizePickupCarrier(undefined), null);
});

const ROWS: PickupCutoffRow[] = [
  { carrier: 'USPS', weekday: 5, cutoffLocal: '15:00' },
  { carrier: 'UPS', weekday: 5, cutoffLocal: '16:30' },
  { carrier: 'FEDEX', weekday: 5, cutoffLocal: '14:00' },
  { carrier: 'USPS', weekday: 1, cutoffLocal: '15:00' },
];

test('pickupCutoffsForDay keeps only that warehouse weekday, earliest first', () => {
  // 2026-03-06 is a Friday (PST, UTC−8).
  assert.deepEqual(pickupCutoffsForDay(ROWS, '2026-03-06'), [
    { carrier: 'FEDEX', cutoffLocal: '14:00', cutoffAt: '2026-03-06T22:00:00.000Z' },
    { carrier: 'USPS', cutoffLocal: '15:00', cutoffAt: '2026-03-06T23:00:00.000Z' },
    { carrier: 'UPS', cutoffLocal: '16:30', cutoffAt: '2026-03-07T00:30:00.000Z' },
  ]);
  // Sunday: nobody picks up.
  assert.deepEqual(pickupCutoffsForDay(ROWS, '2026-03-08'), []);
});

test('pickupCutoffsForDay resolves the wall clock per day across the DST change', () => {
  // DST starts Sunday 2026-03-08: Monday 03-09 is PDT (UTC−7), so 15:00 is 22:00Z, not 23:00Z.
  assert.deepEqual(pickupCutoffsForDay(ROWS, '2026-03-09'), [
    { carrier: 'USPS', cutoffLocal: '15:00', cutoffAt: '2026-03-09T22:00:00.000Z' },
  ]);
});

test('pickupCutoffsForDay yields nothing for an invalid day key', () => {
  assert.deepEqual(pickupCutoffsForDay(ROWS, '2026-13-01'), []);
  assert.deepEqual(pickupCutoffsForDay(ROWS, 'today'), []);
});
