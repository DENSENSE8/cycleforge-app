import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIPMENT_STATUS_CATEGORIES } from '@/lib/shipping/types';
import {
  CARRIER_STATUS,
  CARRIER_STATUS_OF_CATEGORY,
  CARRIER_STATUSES,
  INBOUND_INTERNAL_STATUS,
  INBOUND_INTERNAL_STATUSES,
  OUTBOUND_INTERNAL_STATUS,
  OUTBOUND_INTERNAL_STATUSES,
  RECORD_STATUS_TONE_CLASSES,
  RECORD_STATUS_TONES,
  carrierPhaseOfCategory,
  carrierStatusLabel,
  leadStatus,
  resolveInboundInternalStatus,
  resolveOutboundInternalStatus,
  type RecordStatusSpec,
} from './record-status';

const tables: ReadonlyArray<[string, readonly string[], Readonly<Record<string, RecordStatusSpec>>]> = [
  ['outbound internal', OUTBOUND_INTERNAL_STATUSES, OUTBOUND_INTERNAL_STATUS],
  ['inbound internal', INBOUND_INTERNAL_STATUSES, INBOUND_INTERNAL_STATUS],
  ['external', CARRIER_STATUSES, CARRIER_STATUS],
];

test('every axis declares each status once, with a distinct precedence and a real tone', () => {
  for (const [name, keys, table] of tables) {
    assert.deepEqual(Object.keys(table).sort(), [...keys].sort(), name);
    const ranks = keys.map((key) => table[key]!.precedence);
    assert.equal(new Set(ranks).size, keys.length, `${name}: precedence must not tie`);
    for (const key of keys) assert.ok(RECORD_STATUS_TONES.includes(table[key]!.tone), `${name}.${key}`);
  }
  for (const tone of RECORD_STATUS_TONES) assert.ok(RECORD_STATUS_TONE_CLASSES[tone].pill);
});

test('a finished record wears two greens', () => {
  assert.equal(OUTBOUND_INTERNAL_STATUS.scanned_out.tone, 'green');
  assert.equal(INBOUND_INTERNAL_STATUS.received.tone, 'green');
  assert.equal(CARRIER_STATUS.delivered.tone, 'green');
});

test('every stored carrier category maps; ACCEPTED is On the way, UNKNOWN paints nothing', () => {
  assert.deepEqual(Object.keys(CARRIER_STATUS_OF_CATEGORY).sort(), [...SHIPMENT_STATUS_CATEGORIES].sort());
  assert.equal(carrierStatusLabel('ACCEPTED'), 'On the way');
  assert.equal(carrierStatusLabel('in_transit'), 'In transit');
  assert.equal(carrierStatusLabel('UNKNOWN'), null);
  assert.equal(carrierStatusLabel('Departed facility'), null);
  assert.equal(carrierStatusLabel(null), null);
});

test('custody and movement derive from the carrier phase', () => {
  const moving = SHIPMENT_STATUS_CATEGORIES.filter((category) => carrierPhaseOfCategory(category) === 'moving');
  assert.deepEqual(moving, ['ACCEPTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']);
  const terminal = SHIPMENT_STATUS_CATEGORIES.filter((category) => carrierPhaseOfCategory(category) === 'terminal');
  assert.deepEqual(terminal, ['DELIVERED', 'RETURNED']);
});

test('a record of several packages paints the one most behind; Delivered only when all are', () => {
  assert.equal(leadStatus(CARRIER_STATUS, ['delivered', 'in_transit']), 'in_transit');
  assert.equal(leadStatus(CARRIER_STATUS, ['delivered', 'delivered']), 'delivered');
  assert.equal(leadStatus(CARRIER_STATUS, ['out_for_delivery', 'exception']), 'exception');
  assert.equal(leadStatus(CARRIER_STATUS, []), null);
});

test('outbound internal precedence: buyer cancel › scanned out › on hold › packed › picked › to pick', () => {
  const none = { buyerCancelled: false, scannedOut: false, packed: false, picked: false };
  assert.equal(resolveOutboundInternalStatus(none), 'to_pick');
  assert.equal(resolveOutboundInternalStatus({ ...none, picked: true }), 'picked');
  assert.equal(resolveOutboundInternalStatus({ ...none, picked: true, packed: true }), 'packed');
  assert.equal(resolveOutboundInternalStatus({ ...none, packed: true, onHold: true }), 'on_hold');
  assert.equal(resolveOutboundInternalStatus({ ...none, onHold: true, scannedOut: true }), 'scanned_out');
  assert.equal(resolveOutboundInternalStatus({ ...none, scannedOut: true, buyerCancelled: true }), 'buyer_cancel');
});

test('inbound internal walk: Awaiting tracking → Not received → Unboxed → Received', () => {
  assert.deepEqual(
    [...INBOUND_INTERNAL_STATUSES].sort((a, b) => INBOUND_INTERNAL_STATUS[b].precedence - INBOUND_INTERNAL_STATUS[a].precedence),
    ['awaiting_tracking', 'not_received', 'unboxed', 'received'],
  );
  const none = { hasTracking: false, unboxed: false, received: false };
  assert.equal(resolveInboundInternalStatus(none), 'awaiting_tracking');
  assert.equal(resolveInboundInternalStatus({ ...none, hasTracking: true }), 'not_received');
  assert.equal(resolveInboundInternalStatus({ ...none, hasTracking: true, unboxed: true }), 'unboxed');
  // Received is past unboxing; an opened carton whose units were counted in reads Received.
  assert.equal(resolveInboundInternalStatus({ ...none, hasTracking: true, unboxed: true, received: true }), 'received');
  // A physical fact advances a line that never got tracking.
  assert.equal(resolveInboundInternalStatus({ ...none, unboxed: true }), 'unboxed');
});

test('approved status colours (operator 2026-10-06)', () => {
  assert.deepEqual(
    Object.fromEntries(INBOUND_INTERNAL_STATUSES.map((key) => [key, INBOUND_INTERNAL_STATUS[key].tone])),
    { awaiting_tracking: 'gray', not_received: 'yellow', unboxed: 'teal', received: 'green' },
  );
  assert.equal(CARRIER_STATUS.out_for_delivery.tone, 'teal');
});
