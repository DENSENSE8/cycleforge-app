import test from 'node:test';
import assert from 'node:assert/strict';
import type { FulfilledCheckInRow } from '@/lib/nav/fulfilled/sql';
import { shipmentJourneyNodes, type JourneyNode } from './shipment-journey';
import type { ShipmentRecordJourney } from './shipment-record-types';

// Tue 2026-09-01 15:00 PT.
const HAND_OFF = '2026-09-01T22:00:00.000Z';
const HOUR = 3_600_000;

function journey(over: Partial<ShipmentRecordJourney> = {}): ShipmentRecordJourney {
  return { handOffAt: HAND_OFF, firstCarrierScanAt: null, promisedAt: null, deliveredAt: null, checkIn: null, ...over };
}

function checkIn(over: Partial<FulfilledCheckInRow>): FulfilledCheckInRow {
  return {
    state: 'not_due',
    supportItemId: null,
    triggerAt: null,
    dueAt: null,
    contactedAt: null,
    nextFollowUpAt: null,
    repliedAt: null,
    closedAt: null,
    outcome: null,
    ...over,
  };
}

const face = (nodes: JourneyNode[]) =>
  nodes.map((n) => [n.key, n.label, n.state, n.gap ? `${n.gap.span}${n.gap.running ? '…' : ''}${n.gap.over ? '!' : ''}` : null]);

test('a delivered, checked-in order reads all six nodes with dates and the gaps that broke their thresholds', () => {
  const nodes = shipmentJourneyNodes(
    journey({
      firstCarrierScanAt: '2026-09-02T18:00:00.000Z',
      // Fri 09-04 PT — delivered Sat 09-05 PT: a day late.
      promisedAt: '2026-09-04T23:59:00.000Z',
      deliveredAt: '2026-09-05T20:00:00.000Z',
      checkIn: checkIn({
        state: 'resolved',
        outcome: 'happy',
        dueAt: '2026-09-08T16:00:00.000Z',
        contactedAt: '2026-09-08T17:00:00.000Z',
        repliedAt: '2026-09-09T03:00:00.000Z',
        closedAt: '2026-09-09T20:00:00.000Z',
      }),
    }),
    ['2026-09-02T18:00:00.000Z', '2026-09-03T10:00:00.000Z', '2026-09-04T09:00:00.000Z', '2026-09-05T20:00:00.000Z'],
    Date.parse('2026-09-20T00:00:00Z'),
  );

  assert.deepEqual(face(nodes), [
    ['handed_off', 'Handed off', 'done', null],
    ['carrier_scan', 'Carrier scan', 'done', '+20h'],
    ['delivered', 'Delivered', 'done', '+3d!'],
    ['check_in_sent', 'Check-in sent', 'done', '+2d!'],
    ['customer_replied', 'Customer replied', 'done', '+10h'],
    ['outcome', 'Happy', 'done', '+17h'],
  ]);
  const delivered = nodes[2]!;
  assert.equal(delivered.promisedAt, '2026-09-04T23:59:00.000Z');
  assert.equal(delivered.late, '1d late');
  assert.equal(delivered.silence, null);
  assert.ok(nodes.every((n) => n.at !== null));
});

test('a package with no carrier scan: the hand-off, then an over-tone gap to now on the Carrier scan node', () => {
  const nodes = shipmentJourneyNodes(journey(), [], Date.parse('2026-09-04T22:00:00Z'));

  assert.deepEqual(face(nodes), [
    ['handed_off', 'Handed off', 'done', null],
    ['carrier_scan', 'Carrier scan', 'current', '+3d…!'],
    ['delivered', 'Delivered', 'pending', null],
    ['check_in_sent', 'Check-in sent', 'pending', null],
    ['customer_replied', 'Customer replied', 'pending', null],
    ['outcome', 'Outcome', 'pending', null],
  ]);
  // Inside its business day the same wait is calm.
  const early = shipmentJourneyNodes(journey(), [], Date.parse(HAND_OFF) + 20 * HOUR);
  assert.equal(early[1]!.gap?.over, false);
});

test('carrier silence: the longest gap between carrier events past 72h paints Delivered, delivered or still moving', () => {
  const firstCarrierScanAt = '2026-09-02T18:00:00.000Z';
  const events = [firstCarrierScanAt, '2026-09-03T10:00:00.000Z', '2026-09-07T12:00:00.000Z'];
  const delivered = shipmentJourneyNodes(
    journey({ firstCarrierScanAt, deliveredAt: '2026-09-07T20:00:00.000Z' }),
    [...events, '2026-09-07T20:00:00.000Z'],
    Date.parse('2026-09-20T00:00:00Z'),
  )[2]!;
  assert.equal(delivered.silence, '4d');
  assert.equal(delivered.gap?.over, true);
  assert.equal(delivered.late, null);

  const moving = shipmentJourneyNodes(journey({ firstCarrierScanAt }), events.slice(0, 2), Date.parse('2026-09-07T10:00:00Z'))[2]!;
  assert.equal(moving.state, 'current');
  assert.equal(moving.silence, '4d');
  assert.equal(moving.gap?.running, true);
  assert.equal(moving.gap?.over, true);
});

test('delivered on the promised PT day is on time; undelivered past the promise is late now', () => {
  const firstCarrierScanAt = '2026-09-02T18:00:00.000Z';
  const onTime = shipmentJourneyNodes(
    // Promised 09-04 08:00 PT, delivered 09-04 13:00 PT.
    journey({ firstCarrierScanAt, promisedAt: '2026-09-04T15:00:00.000Z', deliveredAt: '2026-09-04T20:00:00.000Z' }),
    [firstCarrierScanAt, '2026-09-03T18:00:00.000Z', '2026-09-04T20:00:00.000Z'],
    Date.parse('2026-09-20T00:00:00Z'),
  )[2]!;
  assert.equal(onTime.late, null);
  assert.equal(onTime.gap?.over, false);

  const pastDue = shipmentJourneyNodes(
    journey({ firstCarrierScanAt, promisedAt: '2026-09-04T15:00:00.000Z' }),
    [firstCarrierScanAt, '2026-09-03T18:00:00.000Z'],
    Date.parse('2026-09-05T18:00:00Z'),
  )[2]!;
  assert.equal(pastDue.late, '1d late');
  assert.equal(pastDue.gap?.over, true);
});

test('no check-in: the journey ends at Delivered, the customer nodes muted and unmarked', () => {
  const nodes = shipmentJourneyNodes(
    journey({ firstCarrierScanAt: '2026-09-02T18:00:00.000Z', deliveredAt: '2026-09-04T20:00:00.000Z', checkIn: checkIn({ state: 'not_applicable' }) }),
    ['2026-09-02T18:00:00.000Z', '2026-09-04T20:00:00.000Z'],
    Date.parse('2026-09-20T00:00:00Z'),
  );
  assert.deepEqual(nodes.map((n) => n.state), ['done', 'done', 'done', 'pending', 'pending', 'pending']);
  assert.deepEqual(nodes.map((n) => n.noCheckIn), [false, false, false, true, true, true]);
});

test('closed for no response: No reply, measured from the check-in; a reply waiting on us past 24h is over', () => {
  const base = { firstCarrierScanAt: '2026-09-02T18:00:00.000Z', deliveredAt: '2026-09-04T20:00:00.000Z' };
  const events = ['2026-09-02T18:00:00.000Z', '2026-09-04T20:00:00.000Z'];
  const noReply = shipmentJourneyNodes(
    journey({ ...base, checkIn: checkIn({ state: 'no_response_closed', contactedAt: '2026-09-07T17:00:00.000Z', closedAt: '2026-09-14T17:00:00.000Z' }) }),
    events,
    Date.parse('2026-09-20T00:00:00Z'),
  );
  assert.deepEqual(face(noReply).slice(3), [
    ['check_in_sent', 'Check-in sent', 'done', '+2d'],
    ['customer_replied', 'Customer replied', 'pending', null],
    ['outcome', 'No reply', 'done', '+7d'],
  ]);

  const waiting = shipmentJourneyNodes(
    journey({
      ...base,
      checkIn: checkIn({ state: 'staff_reply_due', contactedAt: '2026-09-07T17:00:00.000Z', repliedAt: '2026-09-08T02:00:00.000Z' }),
    }),
    events,
    Date.parse('2026-09-09T08:00:00Z'),
  );
  assert.deepEqual(face(waiting).slice(4), [
    ['customer_replied', 'Customer replied', 'done', '+9h'],
    ['outcome', 'Outcome', 'current', '+30h…!'],
  ]);
});
