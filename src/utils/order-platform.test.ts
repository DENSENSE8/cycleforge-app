import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getOrderPlatformLabel, marketplaceOrderUrl } from './order-platform';

test('eBay 2-5-5 is eBay even when account_source is a Zoho slug', () => {
  assert.equal(getOrderPlatformLabel('03-15100-78272', 'zoho'), 'eBay');
  assert.equal(getOrderPlatformLabel('03-15100-78272', null), 'eBay');
});

test('Amazon 3-7-7 is Amazon even when account_source is unrelated', () => {
  assert.equal(getOrderPlatformLabel('111-1234567-1234567', 'zoho'), 'Amazon');
  assert.equal(getOrderPlatformLabel('902-3159896-1390916', ''), 'Amazon');
});

test('marketplace Open URLs follow the same exact shapes', () => {
  assert.equal(
    marketplaceOrderUrl('03-15100-78272', null),
    'https://www.ebay.com/mesh/ord/details?orderid=03-15100-78272',
  );
  assert.equal(
    marketplaceOrderUrl('111-1234567-1234567', 'zoho'),
    'https://sellercentral.amazon.com/orders-v3/order/111-1234567-1234567',
  );
  assert.equal(marketplaceOrderUrl('PO-99', null), null);
});
