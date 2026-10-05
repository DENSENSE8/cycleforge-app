import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dashboardOrderHref,
  supportCreateTicketHref,
  supportOrdersHref,
} from './order-support-routes';

test('support order routes stay on the shared To-ship desk', () => {
  assert.equal(supportOrdersHref(42), '/shipping/orders?context=support&openOrderId=42');
  assert.equal(supportOrdersHref(0), '/shipping/orders?context=support');
  assert.equal(
    supportCreateTicketHref(42),
    '/shipping/orders?context=support&openOrderId=42&createTicket=1',
  );
  assert.equal(dashboardOrderHref(99), '/shipping/orders?openOrderId=99');
});
