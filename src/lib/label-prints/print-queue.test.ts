import assert from 'node:assert/strict';
import test from 'node:test';
import { orderLinesSql, toOrderLines } from './print-queue';

test('label order lines retain exact order, item and CycleForge product identity', () => {
  assert.deepEqual(
    toOrderLines([
      {
        order_line_id: 901,
        item_number: ' 5076 ',
        sku_catalog_id: 42,
        catalog_title: 'Brake pads',
        product_title: 'Marketplace title',
        sku: ' BP-1 ',
        quantity: 2,
      },
    ]),
    [{
      orderLineId: 901,
      itemNumber: '5076',
      skuCatalogId: 42,
      sku: 'BP-1',
      title: 'Brake pads',
      quantity: 2,
    }],
  );
});

test('the shared order-line SQL emits every association key', () => {
  const sql = orderLinesSql('o.order_id');
  for (const field of ['order_line_id', 'item_number', 'sku_catalog_id', 'catalog_title', 'product_title', 'sku']) {
    assert.match(sql, new RegExp(`'${field}'`));
  }
});
