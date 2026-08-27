import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderCreatedAtMs,
  pinRecentlyCreatedUnshipped,
} from './order-record-normalize';

test('orderCreatedAtMs parses space-separated API timestamps', () => {
  const ms = orderCreatedAtMs({ created_at: '2026-08-26 19:54:00' });
  assert.ok(ms > 0);
});

test('pinRecentlyCreatedUnshipped sorts newest id to the head', () => {
  const rows = [
    { id: 1, order_id: 'ORD-P001' },
    { id: 99, order_id: 'CFLOOP-1' },
    { id: 2, order_id: 'ORD-P002' },
  ];
  const pinned = pinRecentlyCreatedUnshipped(rows);
  assert.deepEqual(
    pinned.map((r) => r.id),
    [99, 2, 1],
  );
});
