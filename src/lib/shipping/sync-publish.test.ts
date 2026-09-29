import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldPublishCarrierSync } from './sync-publish';

test('carrier sync does not publish a true no-op poll', () => {
  assert.equal(shouldPublishCarrierSync({
    previousStatus: 'IN_TRANSIT',
    nextStatus: 'IN_TRANSIT',
    wasDelivered: false,
    deliveredAt: null,
    eventsInserted: 0,
  }), false);
});

test('carrier sync publishes a status change even when the event was already stored', () => {
  assert.equal(shouldPublishCarrierSync({
    previousStatus: 'IN_TRANSIT',
    nextStatus: 'DELIVERED',
    wasDelivered: false,
    deliveredAt: '2026-09-29T08:00:00.000Z',
    eventsInserted: 0,
  }), true);
});

test('carrier sync publishes newly inserted carrier events', () => {
  assert.equal(shouldPublishCarrierSync({
    previousStatus: 'LABEL_CREATED',
    nextStatus: 'LABEL_CREATED',
    wasDelivered: false,
    deliveredAt: null,
    eventsInserted: 1,
  }), true);
});
