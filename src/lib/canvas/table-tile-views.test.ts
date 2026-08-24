/**
 * Tab titles — the one thing a suspended tab still has to get right.
 *
 * A tab strip earns its keep at exactly the moment two tabs hold the same
 * table, so "does the title carry the view identity" is the behaviour worth
 * pinning. Pure functions over a params bag; nothing is mounted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { TABLE_TILE_REFS, tableTileTitle } from './table-tile-views';

test('two tabs of one table do not share a title', () => {
  const queue = tableTileTitle(TABLE_TILE_REFS.receiving, { view: 'queue' });
  const history = tableTileTitle(TABLE_TILE_REFS.receiving, { view: 'history' });
  assert.notEqual(queue, history);
  assert.equal(queue, 'Receiving · Queue');
  assert.equal(history, 'Receiving · History');
});

test('a tab with no params still names its default view', () => {
  assert.equal(tableTileTitle(TABLE_TILE_REFS.receiving, {}), 'Receiving · Queue');
  assert.equal(tableTileTitle(TABLE_TILE_REFS.tasks, {}), 'My tasks · Open');
});

test("Orders' two refs name their layout, and their lane", () => {
  assert.equal(tableTileTitle(TABLE_TILE_REFS.ordersDefault, {}), 'Orders · All');
  assert.equal(
    tableTileTitle(TABLE_TILE_REFS.ordersTested, {}),
    'Orders — tested · Tested',
  );
  assert.equal(
    tableTileTitle(TABLE_TILE_REFS.ordersDefault, { view: 'pending' }),
    'Orders · Pending',
  );
});

test('Incoming names its delivery facet, and "All" when it has none', () => {
  assert.equal(tableTileTitle(TABLE_TILE_REFS.incoming, {}), 'Incoming · All');
  assert.equal(
    tableTileTitle(TABLE_TILE_REFS.incoming, { state: 'DELIVERED_NOT_UNBOXED' }),
    'Incoming · Delivered Not Unboxed',
  );
});

test('Daily names a past day by its date and today by name', () => {
  assert.equal(tableTileTitle(TABLE_TILE_REFS.daily, { date: '2020-01-02' }), 'Daily · 2020-01-02');
  assert.equal(tableTileTitle(TABLE_TILE_REFS.daily, {}), 'Daily · Today');
});

test('an unknown ref falls back to the greppable identifier', () => {
  assert.equal(tableTileTitle('warehouse.bins', {}), 'warehouse.bins');
});
