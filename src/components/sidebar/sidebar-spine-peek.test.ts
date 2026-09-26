import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SIDEBAR_SPINE_PEEK_INSET_PX } from './sidebar-spine';

describe('SIDEBAR_SPINE_PEEK_INSET_PX', () => {
  it('insets the peek card from the viewport edge', () => {
    assert.equal(SIDEBAR_SPINE_PEEK_INSET_PX, 8);
  });
});
