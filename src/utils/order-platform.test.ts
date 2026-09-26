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

test('an imported platform wins over the 4-digit Ecwid guess', () => {
  assert.equal(getOrderPlatformLabel('1117', 'shopify'), 'Shopify');
  assert.equal(getOrderPlatformLabel('1100', 'Other'), 'Other');
  assert.equal(getOrderPlatformLabel('5043', 'ecwid'), 'ECWID');
  assert.equal(getOrderPlatformLabel('5043', null), 'ECWID', 'unsourced legacy rows keep the guess');
});

test('a Shopify order never opens the Ecwid admin', () => {
  const env = process.env;
  process.env = { ...env, NEXT_PUBLIC_ECWID_STORE_ID: '123', NEXT_PUBLIC_SHOPIFY_STORE_HANDLE: 'usav-shop' };
  try {
    assert.equal(
      marketplaceOrderUrl('1117', 'shopify'),
      'https://admin.shopify.com/store/usav-shop/orders?query=1117',
    );
    assert.equal(
      marketplaceOrderUrl('5043', 'ecwid'),
      'https://my.ecwid.com/store/123#order:id=5043&return=orders',
    );
    assert.equal(marketplaceOrderUrl('1100', 'Other'), null);
    process.env.NEXT_PUBLIC_SHOPIFY_STORE_HANDLE = '';
    assert.equal(marketplaceOrderUrl('1117', 'shopify'), 'https://admin.shopify.com/orders?query=1117');
  } finally {
    process.env = env;
  }
});
