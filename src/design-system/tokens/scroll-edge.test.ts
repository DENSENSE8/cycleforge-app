import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SCROLL_MORE_BELOW_CLASS } from './scroll-edge';

describe('scroll-edge SoT', () => {
  it('exports SCROLL_MORE_BELOW_CLASS as a flat bottom gradient (no box-shadow wrap)', () => {
    assert.match(SCROLL_MORE_BELOW_CLASS, /bg-gradient-to-t/);
    assert.doesNotMatch(SCROLL_MORE_BELOW_CLASS, /shadow/);
  });
});
