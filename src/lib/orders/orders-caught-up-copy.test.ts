import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDERS_CAUGHT_UP_TITLE,
  isOrdersQueueCaughtUp,
  ordersCaughtUpDescription,
} from './orders-caught-up-copy';

test('caught-up title is All caught up', () => {
  assert.equal(ORDERS_CAUGHT_UP_TITLE, 'All caught up');
});

test('description includes shipped-today count when the desk has a today total', () => {
  assert.equal(
    ordersCaughtUpDescription(12),
    'Nothing left to ship. 12 shipped today. New orders land here as they sync in.',
  );
  assert.equal(
    ordersCaughtUpDescription(1),
    'Nothing left to ship. 1 shipped today. New orders land here as they sync in.',
  );
});

test('description omits the today fact when nothing shipped today', () => {
  assert.equal(
    ordersCaughtUpDescription(0),
    'Nothing left to ship. New orders land here as they sync in.',
  );
  assert.equal(ordersCaughtUpDescription(-3), ordersCaughtUpDescription(0));
});

test('empty queue is caught-up once a channel or any order history exists', () => {
  assert.equal(
    isOrdersQueueCaughtUp({ shippedToday: 0, ordersEver: 0, integrationsConnected: 0 }),
    false,
  );
  assert.equal(
    isOrdersQueueCaughtUp({ shippedToday: 4, ordersEver: 0, integrationsConnected: 0 }),
    true,
  );
  assert.equal(
    isOrdersQueueCaughtUp({ shippedToday: 0, ordersEver: 1, integrationsConnected: 0 }),
    true,
  );
  assert.equal(
    isOrdersQueueCaughtUp({ shippedToday: 0, ordersEver: 0, integrationsConnected: 1 }),
    true,
  );
});
