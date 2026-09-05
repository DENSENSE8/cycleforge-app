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

  it('start-aligns LABEL + ID types — prose, categorical, location, tracking, id, image', () => {
    for (const type of ['text', 'longtext', 'tag', 'external', 'location', 'tracking', 'id', 'image'] as const) {
      assert.equal(resolveGridColumnAlign({ type }), 'start', type);
      assert.equal(gridCellAlignClass({ type }), 'justify-start text-left', type);
    }
  });

  it('lets an explicit align override the type default', () => {
    assert.equal(resolveGridColumnAlign({ type: 'id', align: 'end' }), 'end');
    assert.equal(resolveGridColumnAlign({ type: 'date', align: 'start' }), 'start');
    assert.equal(resolveGridColumnAlign({ type: 'text', align: 'end' }), 'end');
  });

  // The mechanism, not a live declaration: the 48px photo gutter was the only
  // holder of `center` in the product and lost it on 2026-09-04 (see the module
  // docblock). `compound-column-align.test.ts` pins that nothing declares it.
  it('centers a track that declares it — a per-column escape hatch, never a type default', () => {
    assert.equal(resolveGridColumnAlign({ type: 'image', align: 'center' }), 'center');
    assert.equal(
      gridCellAlignClass({ type: 'image', align: 'center' }),
      'justify-center text-center',
    );
    // Still start by TYPE — centering is a per-column declaration, not a rule.
    assert.equal(resolveGridColumnAlign({ type: 'image' }), 'start');
  });

  it('defaults untyped columns to start', () => {
    assert.equal(resolveGridColumnAlign({}), 'start');
  });
});
