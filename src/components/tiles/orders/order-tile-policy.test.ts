/**
 * Pins the hard rule (operator, 2026-08-24): a display never overrides
 * another tile — it opens as its own tile, and an already-open display of
 * the same kind is the most relevant tile and receives it instead of a
 * duplicate. Pure policy, no DOM — the DOM half was verified live in the
 * Electron window the day the rule landed.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { orderDetailRef, orderDetailTileVerdict } from './order-tile-policy';

const queue = { id: 'tab1', ref: 'orders' };
const product = { id: 'tab9', ref: 'product:00109' };

test('no order display open → a fresh tile opens (the queue is never the target)', () => {
  const v = orderDetailTileVerdict([queue, product], '4997');
  assert.deepEqual(v, { kind: 'open', ref: 'order:4997' });
});

test('the same order again → focus its existing tile, never a duplicate', () => {
  const detail = { id: 'tab2', ref: orderDetailRef('4997') };
  const v = orderDetailTileVerdict([queue, detail], '4997');
  assert.deepEqual(v, { kind: 'focus', tileId: 'tab2' });
});

test('a different order → the open detail tile is the most relevant one and retargets', () => {
  const detail = { id: 'tab2', ref: orderDetailRef('4997') };
  const v = orderDetailTileVerdict([queue, detail], '26-15040-34477');
  assert.deepEqual(v, {
    kind: 'retarget',
    closeTileId: 'tab2',
    ref: 'order:26-15040-34477',
  });
});

test('retarget names ONLY the incumbent detail tile — queue and product tiles are untouchable', () => {
  const detail = { id: 'tab2', ref: orderDetailRef('4997') };
  const v = orderDetailTileVerdict([queue, detail, product], '111-5788029-4222628');
  assert.equal(v.kind, 'retarget');
  assert.equal((v as { closeTileId: string }).closeTileId, 'tab2');
});

test('a product tile is not an order display — it never counts as the incumbent', () => {
  const v = orderDetailTileVerdict([queue, product], '4997');
  assert.equal(v.kind, 'open');
});
