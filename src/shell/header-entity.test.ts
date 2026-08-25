import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyHeaderPublish,
  applyHeaderTileClose,
  applyHeaderTileHover,
  type HeaderEntity,
} from './header-entity';

function order(tileId: string, orderNumber: string): HeaderEntity {
  return {
    kind: 'order',
    tileId,
    orderKey: orderNumber,
    orderNumber,
    tracking: '9400',
    platform: 'ebay',
    urgent: false,
    type: 'shipped',
    price: null,
    listingHref: null,
    claimCount: null,
    photoCount: null,
  };
}

test('composer publish does not replace the last entity', () => {
  const prev = order('t1', '26-1');
  const next = order('t2', '26-2');
  assert.equal(applyHeaderPublish(prev, next, 'composer'), prev);
});

test('assistant publish does not replace the last entity', () => {
  const prev = order('t1', '26-1');
  const next = order('t2', '26-2');
  assert.equal(applyHeaderPublish(prev, next, 'assistant'), prev);
});

test('tile publish last-write-wins', () => {
  const first = order('t1', '26-1');
  const second = order('t2', '26-2');
  assert.equal(applyHeaderPublish(first, second, 'tile'), second);
});

test('hover on composer/assistant tile refs leaves the previous entity', () => {
  const prev = order('t1', '26-1');
  const payload = order('assist', '26-9');
  assert.equal(applyHeaderTileHover(prev, 'assistant', payload), prev);
  assert.equal(applyHeaderTileHover(prev, 'composer', payload), prev);
});

test('hover on a tile with no payload yet keeps the previous entity', () => {
  const prev = order('t1', '26-1');
  assert.equal(applyHeaderTileHover(prev, 'orders', null), prev);
});

test('hover on an order tile replaces with that payload', () => {
  const prev = order('t1', '26-1');
  const next = order('t2', '26-2');
  assert.equal(applyHeaderTileHover(prev, 'order:26-2', next), next);
});

test('closing a different tile leaves the current entity', () => {
  const prev = order('t1', '26-1');
  assert.equal(applyHeaderTileClose(prev, 't-other', order('t3', '26-3')), prev);
});

test('closing the source tile uses the focused fallback when present', () => {
  const prev = order('t1', '26-1');
  const fallback = order('t2', '26-2');
  assert.equal(applyHeaderTileClose(prev, 't1', fallback), fallback);
});

test('closing the source tile with no fallback keeps the snapshot', () => {
  const prev = order('t1', '26-1');
  assert.equal(applyHeaderTileClose(prev, 't1', null), prev);
});
