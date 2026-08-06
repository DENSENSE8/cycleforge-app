import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  gridCellAlignClass,
  resolveGridColumnAlign,
} from './grid-header-align';

describe('resolveGridColumnAlign', () => {
  it('end-aligns MAGNITUDE types — number, price, and date', () => {
    for (const type of ['number', 'price', 'date'] as const) {
      assert.equal(resolveGridColumnAlign({ type }), 'end', type);
      assert.equal(gridCellAlignClass({ type }), 'justify-end text-right', type);
    }
  });

  it('start-aligns LABEL + ID types — prose, categorical, location, tracking, id', () => {
    for (const type of ['text', 'longtext', 'tag', 'external', 'location', 'tracking', 'id'] as const) {
      assert.equal(resolveGridColumnAlign({ type }), 'start', type);
      assert.equal(gridCellAlignClass({ type }), 'justify-start text-left', type);
    }
  });

  it('lets an explicit align override the type default', () => {
    assert.equal(resolveGridColumnAlign({ type: 'id', align: 'end' }), 'end');
    assert.equal(resolveGridColumnAlign({ type: 'date', align: 'start' }), 'start');
    assert.equal(resolveGridColumnAlign({ type: 'text', align: 'end' }), 'end');
  });

  it('defaults untyped columns to start', () => {
    assert.equal(resolveGridColumnAlign({}), 'start');
  });
});
