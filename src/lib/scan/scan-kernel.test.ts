/** Run: node --import tsx --test src/lib/scan/scan-kernel.test.ts */
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanDestination } from '@/lib/scan/scan-kernel';

const one = (status: string | null) => ({
  matches: [{ id: 42, status }],
  matchOutcome: 'single',
  mobileRoute: '/m/orders/112-1234567-1234567',
});

test('desk: one order opens its record on its own desk — open on Allocate, shipped on Fulfilled', () => {
  assert.deepEqual(scanDestination(one('awaiting_shipment'), 'desk'), { kind: 'record', href: '/shipping/orders?openOrderId=42' });
  assert.deepEqual(scanDestination(one('Shipped'), 'desk'), { kind: 'record', href: '/fulfilled?openOrderId=42' });
});

test('phone: the resolver route is the destination, never a desk page', () => {
  assert.deepEqual(scanDestination(one(null), 'phone'), { kind: 'href', href: '/m/orders/112-1234567-1234567' });
});

test('several orders are ambiguous on both surfaces — no list is narrowed to them', () => {
  const answer = { matches: [{ id: 1 }, { id: 2 }], matchOutcome: 'multi', mobileRoute: null };
  assert.deepEqual(scanDestination(answer, 'desk'), { kind: 'ambiguous', count: 2 });
  assert.deepEqual(scanDestination(answer, 'phone'), { kind: 'ambiguous', count: 2 });
});

test('desk: a non-order answer maps the phone route onto the desktop record', () => {
  const po = { matches: [], matchOutcome: 'single', mobileRoute: '/m/r/99' };
  assert.deepEqual(scanDestination(po, 'desk'), { kind: 'href', href: '/unbox?openReceivingId=99' });
});

test('nothing found, or a route the desk has no page for, is none', () => {
  assert.deepEqual(scanDestination({ matches: [], matchOutcome: 'none', mobileRoute: null }, 'desk'), { kind: 'none' });
  assert.deepEqual(scanDestination({ matches: [], matchOutcome: 'single', mobileRoute: '/m/unknown/1' }, 'desk'), { kind: 'none' });
  assert.deepEqual(scanDestination({ matches: [], matchOutcome: 'none', mobileRoute: null }, 'phone'), { kind: 'none' });
});
