/**
 * The compound seam: two families, ONE renderer.
 *
 * These assert the property that keeps this from forking — Receiving and Orders
 * produce the same view shape and the same column geometry, so a layout fix
 * lands once.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { firstNote } from '@/components/tables/compound/compound-row-model';
import { receivingStateTone } from '@/lib/receiving/receiving-compound-view';
import { ordersStateTone } from '@/lib/orders/orders-compound-view';
import { RECEIVING_COMPOUND_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import { ORDERS_COMPOUND_COLUMNS } from '@/lib/dashboard-order-row-layout';

const keys = (c: readonly { key: string }[]) => c.map((x) => x.key);
const widths = (c: readonly { key: string; width?: string }[]) =>
  c.map((x) => `${x.key}:${x.width}`);

describe('compound layout is shared, not forked', () => {
  it('Receiving and Orders declare the SAME compound tracks', () => {
    // HARD RULE: image · ids · title · status. The photo is always leftmost.
    assert.deepEqual(keys(RECEIVING_COMPOUND_COLUMNS), ['select', 'thumb', 'fulfillment', 'item', 'state', 'open', '_fill']);
    assert.deepEqual(keys(ORDERS_COMPOUND_COLUMNS), keys(RECEIVING_COMPOUND_COLUMNS));
  });

  it('and the same geometry — the two tables must read as one product', () => {
    assert.deepEqual(widths(ORDERS_COMPOUND_COLUMNS), widths(RECEIVING_COMPOUND_COLUMNS));
  });

  it('each ends with exactly one 1fr slack track', () => {
    for (const model of [RECEIVING_COMPOUND_COLUMNS, ORDERS_COMPOUND_COLUMNS]) {
      assert.equal(model[model.length - 1].key, '_fill');
      assert.equal(model.filter((c) => String(c.width).includes('1fr')).length, 1);
    }
  });

  it('pins the IMAGE — the hard rule says it is always leftmost', () => {
    for (const model of [RECEIVING_COMPOUND_COLUMNS, ORDERS_COMPOUND_COLUMNS]) {
      const frozen = model.filter((c) => c.frozen).map((c) => c.key);
      assert.deepEqual(frozen, ['select', 'thumb']);
    }
  });

  it('freezes a contiguous prefix in both', () => {
    // gridFrozenLeft sums preceding frozen widths; a gap mis-positions the pane.
    for (const model of [RECEIVING_COMPOUND_COLUMNS, ORDERS_COMPOUND_COLUMNS]) {
      const frozen = model.map((c) => Boolean(c.frozen));
      const firstFalse = frozen.indexOf(false);
      assert.ok(firstFalse > 0);
      assert.ok(!frozen.slice(firstFalse).includes(true));
    }
  });
});

describe('state tone is neutral-by-default on both families', () => {
  it('reserves the loud tone for rows that need a human', () => {
    assert.equal(receivingStateTone('RECEIVING_EXCEPTION'), 'alert');
    assert.equal(receivingStateTone('DAMAGED'), 'alert');
    assert.equal(ordersStateTone('Blocked'), 'alert');
  });

  it('marks completed progress as done', () => {
    assert.equal(receivingStateTone('COMPLETE'), 'done');
    assert.equal(ordersStateTone('Tested'), 'done');
  });

  it('leaves ordinary movement neutral', () => {
    assert.equal(receivingStateTone('IN_PROGRESS'), 'neutral');
    assert.equal(ordersStateTone('Pending'), 'neutral');
    assert.equal(receivingStateTone(null), 'neutral');
    assert.equal(ordersStateTone(undefined), 'neutral');
  });
});

describe('firstNote', () => {
  it('takes the most specific note and never concatenates', () => {
    assert.equal(firstNote(['line note', 'carton note']), 'line note');
    assert.equal(firstNote([null, 'carton note']), 'carton note');
  });
  it('treats whitespace as absent', () => {
    assert.equal(firstNote(['   ', null, undefined]), null);
    assert.equal(firstNote(['  hi  ']), 'hi');
  });
});
