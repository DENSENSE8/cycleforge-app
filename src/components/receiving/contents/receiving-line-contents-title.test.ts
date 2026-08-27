/**
 * Title precedence for receiving line contents rows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receivingLineContentsTitle } from './receiving-line-contents-title';

test('receivingLineContentsTitle prefers Zoho → catalog → item_name → sku', () => {
  assert.equal(
    receivingLineContentsTitle({
      zoho_item_title: ' Zoho ',
      catalog_product_title: 'Cat',
      item_name: 'PO',
      sku: 'SKU',
    }),
    'Zoho',
  );
  assert.equal(
    receivingLineContentsTitle({
      catalog_product_title: 'Cat',
      item_name: 'PO',
    }),
    'Cat',
  );
  assert.equal(receivingLineContentsTitle({ item_name: 'PO' }), 'PO');
  assert.equal(receivingLineContentsTitle({ sku: '00365' }), '00365');
  assert.equal(receivingLineContentsTitle({}), 'Untitled item');
});
