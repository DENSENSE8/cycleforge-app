import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPOUND_TRACK_SORT_KEYS,
  isQueueColumnSort,
  isQueueSortableColumnKey,
  queueSortForColumnKey,
} from './queue-display-sort';
import { ORDERS_COMPOUND_COLUMNS } from '@/lib/dashboard-order-row-layout';

/**
 * The compound header keys are TRACKS; `?sort=` is written in FACTS. Nothing
 * bridged them after To-Ship moved to the two-row row, so every header click was
 * a silent no-op — sorting was off on the desk and stayed off, because the e2e
 * that would have caught it was still clicking a flat locator that resolved to
 * zero elements.
 */

test('the compound tracks that carry a sortable fact resolve to it', () => {
  assert.equal(queueSortForColumnKey('fulfillment'), 'order');
  assert.equal(queueSortForColumnKey('item'), 'title');
});

test('a flat sort value still resolves to itself', () => {
  // `?sort=` values in live bookmarks are facts, and must keep working.
  for (const fact of ['title', 'age', 'qty', 'order', 'tracking', 'picked', 'packed', 'status', 'amount', 'image', 'scanned_out', 'carrier'] as const) {
    assert.ok(isQueueColumnSort(fact));
    assert.equal(queueSortForColumnKey(fact), fact);
  }
});

test('chrome tracks stay unsortable; every data track sorts', () => {
  for (const key of ['select', 'actions', '_fill']) {
    assert.equal(queueSortForColumnKey(key), null, `${key} must not sort`);
    assert.equal(isQueueSortableColumnKey(key), false);
  }
  assert.equal(queueSortForColumnKey('state'), 'status');
  assert.equal(queueSortForColumnKey('amount'), 'amount');
  assert.equal(queueSortForColumnKey('thumb'), 'image');
});

test('every mapped track is a real column of the mounted model', () => {
  // A mapping naming a track the grid does not render is a header that can
  // never be clicked — the same dead-locator failure this fixes, one level up.
  const mounted = new Set(ORDERS_COMPOUND_COLUMNS.map((c) => c.key as string));
  for (const track of Object.keys(COMPOUND_TRACK_SORT_KEYS)) {
    assert.ok(mounted.has(track), `${track} is not a track of ORDERS_COMPOUND_COLUMNS`);
  }
});

test('every mapped fact is a real sort value', () => {
  for (const fact of Object.values(COMPOUND_TRACK_SORT_KEYS)) {
    assert.ok(isQueueColumnSort(fact), `${fact} is not a QueueDisplaySortColumn`);
  }
});

test('a slot field id maps onto the sort fact, so a rebind still sorts', () => {
  assert.equal(queueSortForColumnKey('status:1', 'orders.picked'), 'picked');
  assert.equal(queueSortForColumnKey('status:2', 'orders.packed'), 'packed');
  assert.equal(queueSortForColumnKey('status:3', 'orders.scanned_out'), 'scanned_out');
  assert.equal(queueSortForColumnKey('status:1', 'orders.qty'), 'qty');
  assert.equal(isQueueSortableColumnKey('status:1', 'orders.picked'), true);
  assert.equal(isQueueSortableColumnKey('status:1'), false);
});

test('the product-default Pick track is sortable through its bound field', () => {
  const pick = ORDERS_COMPOUND_COLUMNS.find((c) => c.fieldId === 'orders.picked');
  assert.ok(pick, 'product default must bind orders.picked');
  assert.equal(queueSortForColumnKey(pick.key, pick.fieldId), 'picked');
  assert.equal(isQueueSortableColumnKey(pick.key, pick.fieldId), true);
});

test('every painted data track on the product model sorts', () => {
  const chrome = new Set(['select', 'actions', '_fill']);
  for (const c of ORDERS_COMPOUND_COLUMNS) {
    const sortable = isQueueSortableColumnKey(c.key, c.fieldId);
    if (chrome.has(c.key)) {
      assert.equal(sortable, false, `${c.key} is chrome`);
    } else {
      assert.equal(sortable, true, `${c.key} must sort`);
    }
  }
});
