import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ordersFromReportArgs } from './extract-orders-llm';

describe('ordersFromReportArgs', () => {
  test('trims, whitelists platform, and keeps a readable order id', () => {
    const rows = ordersFromReportArgs({
      orders: [
        {
          order_number: ' 112-1234567-1234567 ',
          platform: 'Amazon',
          item_title: 'Bose SoundLink Flex',
          item_number: 'B09CDH6DT4',
          quantity: 2,
          ship_by_date: 'Sep 5, 2026',
        },
      ],
    });
    assert.equal(rows.length, 1);
    const r = rows[0]!;
    assert.equal(r.orderNumber, '112-1234567-1234567');
    assert.equal(r.platform, 'amazon');
    assert.equal(r.quantity, '2');
    assert.equal(r.sku, '');
    assert.equal(r.trackingNumber, '');
  });

  test('an unknown platform is blank, never a guess', () => {
    const rows = ordersFromReportArgs({
      orders: [{ order_number: '1', platform: 'marketplace-x' }],
    });
    assert.equal(rows[0]!.platform, '');
  });

  test('quantity must be a positive integer or it is still-needed', () => {
    const rows = ordersFromReportArgs({
      orders: [
        { order_number: 'a', quantity: 0 },
        { order_number: 'b', quantity: '3' },
        { order_number: 'c', quantity: 'two' },
        { order_number: 'd', quantity: 2.9 },
      ],
    });
    assert.deepEqual(
      rows.map((r) => r.quantity),
      ['', '3', '', '2'],
    );
  });

  test('exact repeats across pages collapse; distinct lines of one order stay', () => {
    const rows = ordersFromReportArgs({
      orders: [
        { order_number: '04-1-1', sku: 'A', quantity: 1 },
        { order_number: '04-1-1', sku: 'A', quantity: 1 },
        { order_number: '04-1-1', sku: 'B', quantity: 1 },
      ],
    });
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => r.sku),
      ['A', 'B'],
    );
  });

  test('a row with nothing readable is dropped', () => {
    const rows = ordersFromReportArgs({
      orders: [{ order_number: '', platform: '', item_title: '' }, { order_number: 'x' }],
    });
    assert.equal(rows.length, 1);
  });

  test('a missing orders array yields no rows', () => {
    assert.deepEqual(ordersFromReportArgs({}), []);
  });
});
