/**
 * The compound column model is a SIBLING of the flat one, and the engine below
 * both is untouched. These pin the two properties that make that true.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RECEIVING_COMPOUND_COLUMNS,
  RECEIVING_GRID_COLUMNS,
} from '@/lib/receiving/receiving-grid-layout';

const keys = (cols: readonly { key: string }[]) => cols.map((c) => c.key);

describe('compound column model', () => {
  it('is the two-row layout from the brief, in order', () => {
    assert.deepEqual(keys(RECEIVING_COMPOUND_COLUMNS), ['select', 'thumb', 'fulfillment', 'item', 'state', 'amount', 'actions', '_fill']);
  });

  it('is a separate array, not a filter of the flat model', () => {
    // The compound tracks must not leak into the spreadsheet layout — the same
    // rule INCOMING_GRID_COLUMNS follows.
    const flat = new Set(keys(RECEIVING_GRID_COLUMNS));
    for (const k of ['thumb', 'item', 'fulfillment', 'state', 'amount', 'actions']) {
      assert.ok(!flat.has(k), `${k} must not appear in RECEIVING_GRID_COLUMNS`);
    }
  });

  it('ends with the sole 1fr slack track', () => {
    const last = RECEIVING_COMPOUND_COLUMNS[RECEIVING_COMPOUND_COLUMNS.length - 1];
    assert.equal(last.key, '_fill');
    const fillish = RECEIVING_COMPOUND_COLUMNS.filter((c) => String(c.width).includes('1fr'));
    assert.equal(fillish.length, 1, 'exactly one track may own the slack');
  });

  it('freezes a contiguous prefix', () => {
    // gridFrozenLeft sums the widths of preceding frozen columns, so a gap in
    // the frozen prefix silently mis-positions the sticky pane.
    const frozen = RECEIVING_COMPOUND_COLUMNS.map((c) => Boolean(c.frozen));
    const firstUnfrozen = frozen.indexOf(false);
    assert.ok(firstUnfrozen > 0, 'at least one frozen identity column');
    assert.ok(!frozen.slice(firstUnfrozen).includes(true), 'frozen columns must be a prefix');
  });

  it('keeps the thumbnail track leftmost and frozen', () => {
    const thumb = RECEIVING_COMPOUND_COLUMNS.find((c) => c.key === 'thumb')!;
    assert.ok(thumb.frozen, 'the image is the pinned row handle');
    // Only the select gutter may precede it.
    assert.equal(RECEIVING_COMPOUND_COLUMNS.findIndex((c) => c.key === 'thumb'), 1);
  });

  it('sizes the photo gutter exactly like the select gutter', () => {
    // The operator's invariant, stated as one: two equal squares open the row.
    const select = RECEIVING_COMPOUND_COLUMNS.find((c) => c.key === 'select')!;
    const thumb = RECEIVING_COMPOUND_COLUMNS.find((c) => c.key === 'thumb')!;
    assert.equal(thumb.width, select.width);
  });

  it('lets an operator drag every DATA track', () => {
    // Was `['item']` only, which is how an 11rem `fulfillment` could leave a
    // gutter beside a short order chip with no way for the floor to close it.
    // The two gutters are excluded on purpose — see the width test above.
    const resizable = RECEIVING_COMPOUND_COLUMNS.filter((c) => c.resizable).map((c) => c.key);
    assert.deepEqual(resizable, ['fulfillment', 'item', 'state', 'amount']);
  });

  it('never offers sort on chrome tracks', () => {
    for (const key of ['select', 'thumb', 'actions']) {
      const col = RECEIVING_COMPOUND_COLUMNS.find((c) => c.key === key)!;
      assert.equal(col.sortable, false, `${key} is chrome, not a fact`);
    }
  });
});
