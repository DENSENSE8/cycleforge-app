import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationHref } from './notification-href';

test('overdue outbound alerts open Search on external fulfillment', () => {
  assert.equal(
    notificationHref('order', 42, 'order.ship_by.overdue_unfulfilled'),
    '/search?sel=order:42&fulfillment=external',
  );
});

test('ordinary order notifications keep the default fulfillment lens', () => {
  assert.equal(notificationHref('order', 42), '/search?sel=order:42');
});
