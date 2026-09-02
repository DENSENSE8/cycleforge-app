import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyOrdersDeskContext,
  isDashboardOutboundOrdersUrl,
  parseOrdersDeskContext,
  shippingOrdersHref,
  SHIPPING_SHORTAGE_PATH,
} from './orders-desk';

describe('orders-desk', () => {
  it('parses support context', () => {
    assert.equal(parseOrdersDeskContext('support'), 'support');
    assert.equal(parseOrdersDeskContext('SUPPORT'), 'support');
    assert.equal(parseOrdersDeskContext(null), null);
    assert.equal(parseOrdersDeskContext('fulfillment'), null);
  });

  it('builds canonical hrefs', () => {
    assert.equal(shippingOrdersHref(), '/shipping/orders');
    assert.equal(SHIPPING_SHORTAGE_PATH, '/shipping/shortage');
    assert.equal(
      shippingOrdersHref({ context: 'support' }),
      '/shipping/orders?context=support',
    );
    assert.equal(
      shippingOrdersHref({ openOrderId: 7 }),
      '/shipping/orders?openOrderId=7',
    );
    assert.equal(
      shippingOrdersHref({ context: 'support', openOrderId: 7, createTicket: true }),
      '/shipping/orders?context=support&openOrderId=7&createTicket=1',
    );
  });

  it('clears support-only params when leaving support context', () => {
    const params = new URLSearchParams('context=support&createTicket=1&openOrderId=3');
    const next = applyOrdersDeskContext(params, null);
    assert.equal(next.get('context'), null);
    assert.equal(next.get('createTicket'), null);
    assert.equal(next.get('openOrderId'), '3');
  });

  it('detects dashboard outbound URLs that should redirect', () => {
    assert.equal(isDashboardOutboundOrdersUrl('/dashboard', new URLSearchParams()), true);
    assert.equal(
      isDashboardOutboundOrdersUrl('/dashboard', new URLSearchParams('shipped=')),
      true,
    );
    assert.equal(
      isDashboardOutboundOrdersUrl('/dashboard', new URLSearchParams('mode=sales')),
      false,
    );
    assert.equal(
      isDashboardOutboundOrdersUrl('/dashboard', new URLSearchParams('mode=pickup')),
      false,
    );
    assert.equal(
      isDashboardOutboundOrdersUrl('/dashboard', new URLSearchParams('mode=repairs')),
      false,
    );
    assert.equal(
      isDashboardOutboundOrdersUrl('/dashboard', new URLSearchParams('warranty')),
      false,
    );
  });
});
