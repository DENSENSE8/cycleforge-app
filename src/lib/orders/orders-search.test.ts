import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { escapeLike } from '@/lib/sql-like';
import {
  expandHitsToOrderSiblings,
  ordersSearchLast8,
  ordersSearchLikePattern,
  ordersSearchNeedle,
} from '@/lib/orders/orders-search';

test('empty and whitespace search is a no-op', () => {
  assert.equal(ordersSearchLikePattern(''), null);
  assert.equal(ordersSearchLikePattern('   '), null);
  assert.equal(ordersSearchNeedle('  foo  '), 'foo');
});

test('LIKE wildcards in a SKU or order id match literally', () => {
  assert.equal(ordersSearchLikePattern('ABC_123'), `%${escapeLike('ABC_123')}%`);
  assert.equal(ordersSearchLikePattern('ABC_123'), '%ABC\\_123%');
  assert.equal(ordersSearchLikePattern('100%'), '%100\\%%');
});

test('amazon-style last-8 strips dashes then takes the tail', () => {
  // 111-2222222-3333333 → 11122222223333333 → last 8 = 23333333
  assert.equal(ordersSearchLast8('111-2222222-3333333'), '23333333');
  assert.equal(ordersSearchLast8('short'), '');
});

test('a hit on one line of a fold keeps every sibling line', () => {
  const rows = [
    { id: 1, order_id: 'A', title: 'Seed Socks' },
    { id: 2, order_id: 'A', title: 'Widget' },
    { id: 3, order_id: 'B', title: 'Other' },
  ];
  const expanded = expandHitsToOrderSiblings(rows, [rows[0]!]);
  assert.deepEqual(expanded.map((row) => row.id), [1, 2]);
});

test('a line with no order_id does not pull unrelated rows', () => {
  const rows = [
    { id: 1, order_id: null, title: 'Loose' },
    { id: 2, order_id: 'A', title: 'Order' },
  ];
  const expanded = expandHitsToOrderSiblings(rows, [rows[0]!]);
  assert.deepEqual(expanded.map((row) => row.id), [1]);
});
