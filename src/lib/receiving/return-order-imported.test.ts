import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  returnOrderImportedCopy,
  returnOrderLineFill,
} from './return-order-imported';

test('toast title is the order product title; description is RETURN · platform · order id', () => {
  const copy = returnOrderImportedCopy({
    orderId: '113-7983451-3887414',
    productTitle: 'Bose TV Speaker Soundbar 431974',
    platform: 'amazon',
  });
  assert.equal(copy.title, 'Bose TV Speaker Soundbar 431974');
  assert.equal(copy.description, 'RETURN · Amazon · 113-7983451-3887414');
});

test('toast title falls back to Order {id} when product title is empty', () => {
  const copy = returnOrderImportedCopy({
    orderId: 'EBAY-123',
    productTitle: '  ',
    platform: 'ebay',
  });
  assert.equal(copy.title, 'Order EBAY-123');
  assert.equal(copy.description, 'RETURN · eBay · EBAY-123');
});

test('line fill uses product title as item_name, stamps RETURN + order id + platform', () => {
  const fill = returnOrderLineFill({
    orderId: '113-7983451-3887414',
    productTitle: 'Bose TV Speaker Soundbar 431974',
    sku: '00138-BK',
    platform: 'amazon',
  });
  assert.equal(fill.receiving_type, 'RETURN');
  assert.equal(fill.source_order_id, '113-7983451-3887414');
  assert.equal(fill.zoho_purchaseorder_number, '113-7983451-3887414');
  assert.equal(fill.item_name, 'Bose TV Speaker Soundbar 431974');
  assert.equal(fill.sku, '00138-BK');
  assert.equal(fill.source_platform, 'amazon');
});
