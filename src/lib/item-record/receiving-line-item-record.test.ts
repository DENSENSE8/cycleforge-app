/**
 *   node --import tsx --test src/lib/item-record/receiving-line-item-record.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { receivingLinesToItemRecords } from './receiving-line-item-record';

test('receivingLinesToItemRecords maps title precedence and quantities', () => {
  const [item] = receivingLinesToItemRecords([
    {
      id: 9,
      sku: 'SKU-1',
      item_name: 'PO title',
      zoho_item_title: 'Zoho title',
      catalog_product_title: 'Catalog title',
      quantity_expected: 2,
      quantity_received: 1,
      qa_status: null,
      disposition_code: null,
      condition_grade: 'B',
      workflow_status: null,
      receiving_type: null,
      location_code: null,
      listing_reference: null,
      notes: null,
      zoho_purchaseorder_number: null,
      tracking_number: null,
      image_url: 'https://example.com/thumb.jpg',
      serials: [{ id: 1, serial_number: 'SN-1', current_status: null, current_location: null, condition_grade: null }],
    },
  ]);

  assert.equal(item.title, 'Zoho title');
  assert.equal(item.sku, 'SKU-1');
  assert.deepEqual(item.quantity, { expected: 2, counted: 1 });
  assert.equal(item.conditionGrade, 'B');
  assert.deepEqual(item.serials, ['SN-1']);
  assert.equal(item.imageUrl, 'https://example.com/thumb.jpg');
});

test('receivingLinesToItemRecords: empty lines → empty list', () => {
  assert.deepEqual(receivingLinesToItemRecords([]), []);
});
