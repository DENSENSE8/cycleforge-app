import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  gridCellAlignClass,
  resolveGridColumnAlign,
} from './grid-header-align';

describe('resolveGridColumnAlign', () => {
  it('end-aligns MAGNITUDE types — number, id, and date', () => {
    for (const type of ['number', 'id', 'date'] as const) {
      assert.equal(resolveGridColumnAlign({ type }), 'end', type);
      assert.equal(gridCellAlignClass({ type }), 'justify-end', type);
    }
  });

  it('start-aligns LABEL types — prose, categorical, and location', () => {
    // `location` stayed start on 2026-08-02: a tracking last-8 is a name you
    // READ, not a magnitude you compare. `date` rejoined magnitudes 2026-08-03.
    for (const type of ['text', 'longtext', 'tag', 'external', 'location', 'tracking'] as const) {
      assert.equal(resolveGridColumnAlign({ type }), 'start', type);
      assert.equal(gridCellAlignClass({ type }), 'justify-start', type);
    }
  });

  it('lets an explicit align override the type default', () => {
    // Live override: `order` is an `id` that is the row's transaction identity
    // (a name → start). Also pin the reverse direction so a future type-map
    // flip cannot silently erase the override contract.
    assert.equal(resolveGridColumnAlign({ type: 'id', align: 'start' }), 'start');
    assert.equal(resolveGridColumnAlign({ type: 'date', align: 'start' }), 'start');
    assert.equal(resolveGridColumnAlign({ type: 'text', align: 'end' }), 'end');
  });

  it('defaults untyped columns to start', () => {
    assert.equal(resolveGridColumnAlign({}), 'start');
  });
});
