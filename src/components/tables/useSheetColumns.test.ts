import test from 'node:test';
import assert from 'node:assert/strict';
import { moveSheetColumn, orderSheetColumns } from './useSheetColumns';

const col = (key: string, width = 'minmax(4rem, 4rem)') => ({ key, width });
const BASE = [col('pos'), col('ref'), col('where'), col('product'), col('vendor'), col('detail', 'minmax(18rem, 1fr)')];
const keys = (columns: readonly { key: string }[]) => columns.map((c) => c.key);

test('a move lands on the dropped-on place: after it moving right, before it moving left', () => {
  const all = keys(BASE);
  assert.deepEqual(moveSheetColumn(all, 'where', 'vendor'), ['pos', 'ref', 'product', 'vendor', 'where', 'detail']);
  assert.deepEqual(moveSheetColumn(all, 'vendor', 'ref'), ['pos', 'vendor', 'ref', 'where', 'product', 'detail']);
  // Unknown keys or a drop on itself change nothing.
  assert.deepEqual(moveSheetColumn(all, 'nope', 'ref'), all);
  assert.deepEqual(moveSheetColumn(all, 'ref', 'ref'), all);
});

test('the saved order applies; the slack-absorbing track stays last whatever the order says', () => {
  const ordered = orderSheetColumns(BASE, ['detail', 'vendor', 'pos', 'ref', 'where', 'product']);
  assert.deepEqual(keys(ordered), ['vendor', 'pos', 'ref', 'where', 'product', 'detail']);
});

test('a column the saved order never named mounts beside its model neighbour; stale keys are skipped', () => {
  const saved = ['pos', 'ref', 'vendor', 'where', 'gone'];
  // `product` is new: its model predecessor `where` is placed, so it lands right after it.
  assert.deepEqual(keys(orderSheetColumns(BASE, saved)), ['pos', 'ref', 'vendor', 'where', 'product', 'detail']);
  // No saved order = the model's own.
  assert.deepEqual(keys(orderSheetColumns(BASE, [])), keys(BASE));
});
