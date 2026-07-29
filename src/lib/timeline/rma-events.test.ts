import test from 'node:test';
import assert from 'node:assert/strict';
import { rmaEventsToTimeline, type RmaTimelineRow } from './rma-events';

function row(over: Partial<RmaTimelineRow> = {}): RmaTimelineRow {
  return {
    id: 1,
    rma_number: 'RMA-1001',
    direction: 'INBOUND_FROM_CUSTOMER',
    status: 'AUTHORIZED',
    authorized_at: '2026-07-01T10:00:00.000Z',
    closed_at: null,
    expected_carrier: null,
    notes: null,
    actor_name: null,
    ...over,
  };
}

test('rmaEventsToTimeline: open RMA emits one row anchored at authorized_at', () => {
  const items = rmaEventsToTimeline([row()]);
  assert.equal(items.length, 1);
  assert.equal(items[0].at, '2026-07-01T10:00:00.000Z');
  assert.equal(items[0].title, 'Customer return authorized');
  assert.equal(items[0].sourceEventType, 'RMA_AUTHORIZED');
  assert.deepEqual(items[0].ref, { value: 'RMA-1001', kind: 'id' });
});

test('rmaEventsToTimeline: a closed RMA also emits a close row', () => {
  const items = rmaEventsToTimeline([
    row({ status: 'CLOSED', closed_at: '2026-07-05T12:00:00.000Z' }),
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[1].at, '2026-07-05T12:00:00.000Z');
  assert.equal(items[1].sourceEventType, 'RMA_CLOSED');
  // Distinct ids — a duplicate key would break AnimatePresence / React lists.
  assert.notEqual(items[0].id, items[1].id);
});

test('rmaEventsToTimeline: direction drives the label, not the status', () => {
  const [vendor] = rmaEventsToTimeline([row({ direction: 'OUTBOUND_TO_VENDOR' })]);
  assert.equal(vendor.title, 'Vendor return (RTV) authorized');
  const [unknown] = rmaEventsToTimeline([row({ direction: null })]);
  assert.equal(unknown.title, 'Return authorized');
});

test('rmaEventsToTimeline: tones separate open / settled / failed states', () => {
  const toneOf = (status: string) => rmaEventsToTimeline([row({ status })])[0].tone;
  assert.equal(toneOf('AUTHORIZED'), 'warning');
  assert.equal(toneOf('RECEIVED'), 'success');
  assert.equal(toneOf('DISPOSITIONED'), 'success');
  assert.equal(toneOf('CANCELLED'), 'danger');
  assert.equal(toneOf('CLOSED'), 'muted');
});

test('rmaEventsToTimeline: subtitle composes only the parts that exist', () => {
  const [bare] = rmaEventsToTimeline([row()]);
  assert.equal(bare.subtitle, 'Status authorized');

  const [full] = rmaEventsToTimeline([
    row({ expected_carrier: 'UPS', notes: 'Buyer reports no power' }),
  ]);
  assert.equal(full.subtitle, 'Status authorized · via UPS · Buyer reports no power');
});
