import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrderGroupFacts, OrderShipmentFact } from '@/lib/support/orders/order-facts';
import { SUPPORT_CHECK_IN_PROGRAM_START, supportCheckInProgramStartMs } from './config';
import { deriveOrderCheckInMilestone, orderCheckInIneligibleReason } from './milestones';
import { projectedCheckInState } from './milestones-db';

const START = Date.parse('2026-10-04T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function shipment(id: number, extra: Partial<OrderShipmentFact> = {}): OrderShipmentFact {
  return {
    shipmentId: id,
    trackingNumber: `TRK${id}`,
    isDelivered: false,
    deliveredAt: null,
    carrierAcceptedAt: null,
    shipConfirmAt: null,
    ...extra,
  };
}

function order(extra: Partial<OrderGroupFacts> = {}): OrderGroupFacts {
  return {
    representativeOrderId: 500,
    lineIds: [500, 501],
    orderNumber: '22-15228-39486',
    accountSource: 'DRAGON',
    platform: { slug: 'ebay', accountLabel: 'DRAGON', platformAccountId: 1 },
    statuses: ['shipped'],
    anyAfn: false,
    pickup: false,
    customer: { name: 'Ada Buyer', email: null, phone: null },
    adminUrl: null,
    products: [],
    shipments: [],
    shipConfirmAt: null,
    ...extra,
  };
}

test('program start: default and env override; garbage env falls back', () => {
  assert.equal(supportCheckInProgramStartMs({}), Date.parse(SUPPORT_CHECK_IN_PROGRAM_START));
  assert.equal(supportCheckInProgramStartMs({ SUPPORT_CHECK_IN_PROGRAM_START: '2026-11-01T00:00:00Z' }), Date.parse('2026-11-01T00:00:00Z'));
  assert.equal(supportCheckInProgramStartMs({ SUPPORT_CHECK_IN_PROGRAM_START: 'soon' }), START);
});

test('program-start gate: a delivery before the start never projects; at/after it does', () => {
  const before = order({ shipments: [shipment(1, { isDelivered: true, deliveredAt: '2026-10-03T23:59:59.000Z' })] });
  assert.equal(deriveOrderCheckInMilestone(before, { programStartMs: START }), null);

  const at = order({ shipments: [shipment(1, { isDelivered: true, deliveredAt: '2026-10-04T00:00:00.000Z' })] });
  const m = deriveOrderCheckInMilestone(at, { programStartMs: START });
  assert.ok(m);
  assert.equal(m.triggerKind, 'delivered');
  assert.equal(m.orderId, 500, 'keyed by the representative orders.id');
  assert.equal(m.dueAt, new Date(START + 2 * DAY).toISOString(), 'due 2 days after delivery');
});

test('delivered = every shipment delivered, at the LAST arrival; partial delivery is the shipped fallback', () => {
  const both = order({
    shipments: [
      shipment(1, { isDelivered: true, deliveredAt: '2026-10-05T10:00:00.000Z', carrierAcceptedAt: '2026-10-04T08:00:00.000Z' }),
      shipment(2, { isDelivered: true, deliveredAt: '2026-10-06T10:00:00.000Z', carrierAcceptedAt: '2026-10-04T09:00:00.000Z' }),
    ],
  });
  const m = deriveOrderCheckInMilestone(both, { programStartMs: START })!;
  assert.equal(m.triggerKind, 'delivered');
  assert.equal(m.triggerAt, '2026-10-06T10:00:00.000Z');
  assert.equal(m.triggerRef, 'shipment:2');

  const partial = order({
    shipments: [
      shipment(1, { isDelivered: true, deliveredAt: '2026-10-05T10:00:00.000Z', carrierAcceptedAt: '2026-10-04T08:00:00.000Z' }),
      shipment(2, { carrierAcceptedAt: '2026-10-04T09:00:00.000Z' }),
    ],
  });
  const f = deriveOrderCheckInMilestone(partial, { programStartMs: START })!;
  assert.equal(f.triggerKind, 'shipped_fallback');
  assert.equal(f.triggerAt, '2026-10-04T08:00:00.000Z', 'earliest the order left');
  assert.equal(f.dueAt, new Date(Date.parse('2026-10-04T08:00:00.000Z') + 10 * DAY).toISOString(), 'fallback due 10 days after ship');
});

test('shipped fallback uses the dock scan-out when the carrier never reported acceptance', () => {
  const m = deriveOrderCheckInMilestone(order({ shipments: [shipment(3, { shipConfirmAt: '2026-10-04T12:00:00.000Z' })] }), {
    programStartMs: START,
  })!;
  assert.equal(m.triggerKind, 'shipped_fallback');
  assert.equal(m.triggerRef, 'shipment:3');
});

test('picked_up: a counter pickup handed over at SHIP_CONFIRM, due 2 days later', () => {
  const m = deriveOrderCheckInMilestone(
    order({ pickup: true, shipConfirmAt: '2026-10-04T15:00:00.000Z', customer: { name: 'Walk In', email: null, phone: '7145550100' } }),
    { programStartMs: START },
  )!;
  assert.equal(m.triggerKind, 'picked_up');
  assert.equal(m.triggerRef, 'order:500');
  assert.equal(m.dueAt, new Date(Date.parse('2026-10-04T15:00:00.000Z') + 2 * DAY).toISOString());
  assert.equal(m.notApplicableReason, null);
});

test('no milestone yet → null (an unshipped order never projects)', () => {
  assert.equal(deriveOrderCheckInMilestone(order({ shipments: [shipment(9)] }), { programStartMs: START }), null);
});

test('eligibility: AFN, cancelled/refunded, no contact path → not_applicable with a reason', () => {
  const delivered = [shipment(1, { isDelivered: true, deliveredAt: '2026-10-05T00:00:00.000Z' })];
  assert.match(orderCheckInIneligibleReason(order({ anyAfn: true }))!, /AFN/);
  assert.match(orderCheckInIneligibleReason(order({ statuses: ['cancelled'] }))!, /cancelled/);
  assert.match(orderCheckInIneligibleReason(order({ statuses: ['refunded'] }))!, /refunded/);
  assert.equal(orderCheckInIneligibleReason(order({ statuses: ['shipped', 'cancelled'] })), null, 'one cancelled line does not cancel the order');
  const ecwidNoContact = order({ platform: { slug: 'ecwid', accountLabel: null, platformAccountId: null } });
  assert.match(orderCheckInIneligibleReason(ecwidNoContact)!, /No way to reach/);
  assert.equal(orderCheckInIneligibleReason(order()), null, 'eBay messaging is a contact path without an email');
  assert.equal(
    orderCheckInIneligibleReason({ ...ecwidNoContact, customer: { name: null, email: 'a@b.co', phone: null } }),
    null,
  );

  const m = deriveOrderCheckInMilestone(order({ anyAfn: true, shipments: delivered }), { programStartMs: START })!;
  assert.ok(m.notApplicableReason);
  assert.equal(projectedCheckInState(m, Date.parse('2026-10-20T00:00:00Z')), 'not_applicable');
});

test('projected state: not_due before the due instant, due at/after it', () => {
  const m = deriveOrderCheckInMilestone(
    order({ shipments: [shipment(1, { isDelivered: true, deliveredAt: '2026-10-05T00:00:00.000Z' })] }),
    { programStartMs: START },
  )!;
  assert.equal(projectedCheckInState(m, Date.parse('2026-10-06T23:59:59Z')), 'not_due');
  assert.equal(projectedCheckInState(m, Date.parse('2026-10-07T00:00:00Z')), 'due');
});
