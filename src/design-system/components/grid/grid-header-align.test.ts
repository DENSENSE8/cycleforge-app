import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  gridCellAlignClass,
  resolveGridColumnAlign,
} from './grid-header-align';

describe('resolveGridColumnAlign', () => {
  it('end-aligns numeric-looking column types', () => {
    for (const type of ['number', 'id', 'location', 'date'] as const) {
      assert.equal(resolveGridColumnAlign({ type }), 'end', type);
      assert.equal(gridCellAlignClass({ type }), 'justify-end', type);
    }
  });

  it('start-aligns prose / categorical types', () => {
    for (const type of ['text', 'longtext', 'tag', 'external'] as const) {
      assert.equal(resolveGridColumnAlign({ type }), 'start', type);
      assert.equal(gridCellAlignClass({ type }), 'justify-start', type);
    }
  });

  it('lets an explicit align override the type default', () => {
    assert.equal(resolveGridColumnAlign({ type: 'date', align: 'start' }), 'start');
    assert.equal(resolveGridColumnAlign({ type: 'text', align: 'end' }), 'end');
  });

  it('defaults untyped columns to start', () => {
    assert.equal(resolveGridColumnAlign({}), 'start');
  });
});
