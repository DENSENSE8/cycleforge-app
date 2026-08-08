import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deskRowFromCsvRecord } from './desk-csv';

test('deskRowFromCsvRecord: amazon return row', () => {
  const row = deskRowFromCsvRecord({
    kind: 'return',
    source: 'amazon',
    order_id: '111-2223334-5556667',
    sku: 'SKU-1',
    item_name: 'Widget',
    qty: '2',
    tracking: '1Z999AA10123456784',
    listing_url: 'https://www.amazon.com/dp/B00TEST',
    rma_id: 'RMA-9',
    return_reason: 'defective',
  });
  assert.equal(row.kind, 'return');
  assert.equal(row.sourceType, 'amazon');
  assert.equal(row.orderId, '111-2223334-5556667');
  assert.equal(row.sku, 'SKU-1');
  assert.equal(row.quantity, 2);
  assert.equal(row.trackingNumber, '1Z999AA10123456784');
  assert.equal(row.listingUrl, 'https://www.amazon.com/dp/B00TEST');
  assert.equal(row.rmaId, 'RMA-9');
  assert.equal(row.returnReason, 'defective');
});

test('deskRowFromCsvRecord: defaults to purchase / manual', () => {
  const row = deskRowFromCsvRecord({
    order_number: 'PO-1',
    title: 'Thing',
  });
  assert.equal(row.kind, 'purchase');
  assert.equal(row.sourceType, 'manual');
  assert.equal(row.orderId, 'PO-1');
  assert.equal(row.itemName, 'Thing');
});

test('deskRowFromCsvRecord: amz alias → amazon', () => {
  const row = deskRowFromCsvRecord({
    platform: 'amz',
    order_id: 'A1',
    sku: 'X',
  });
  assert.equal(row.sourceType, 'amazon');
});
