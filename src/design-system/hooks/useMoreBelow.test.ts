import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { moreBelowFromMetrics } from './useMoreBelow';

describe('moreBelowFromMetrics', () => {
  it('false when content fits (no overflow)', () => {
    assert.equal(moreBelowFromMetrics(0, 400, 400), false);
    assert.equal(moreBelowFromMetrics(0, 400, 401), false); // within 2px threshold
  });

  it('true at top when content overflows', () => {
    assert.equal(moreBelowFromMetrics(0, 400, 800), true);
  });

  it('true mid-scroll when not yet at bottom', () => {
    assert.equal(moreBelowFromMetrics(100, 400, 800), true);
  });

  it('false when scrolled to the bottom', () => {
    assert.equal(moreBelowFromMetrics(400, 400, 800), false);
    // Within threshold of the end
    assert.equal(moreBelowFromMetrics(399, 400, 800), false);
  });
});
