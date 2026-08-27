import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { overflowXFromMetrics } from './grid-overflow-x';

describe('overflowXFromMetrics', () => {
  it('both false when content fits (no overflow)', () => {
    assert.deepEqual(overflowXFromMetrics(0, 400, 400), {
      overflowStart: false,
      overflowEnd: false,
    });
    // Within 2px threshold
    assert.deepEqual(overflowXFromMetrics(0, 400, 401), {
      overflowStart: false,
      overflowEnd: false,
    });
  });

  it('end true at rest when content overflows', () => {
    assert.deepEqual(overflowXFromMetrics(0, 400, 800), {
      overflowStart: false,
      overflowEnd: true,
    });
  });

  it('both true mid-scroll', () => {
    assert.deepEqual(overflowXFromMetrics(100, 400, 800), {
      overflowStart: true,
      overflowEnd: true,
    });
  });

  it('start true / end false when scrolled to the end', () => {
    assert.deepEqual(overflowXFromMetrics(400, 400, 800), {
      overflowStart: true,
      overflowEnd: false,
    });
    // Within threshold of the end
    assert.deepEqual(overflowXFromMetrics(399, 400, 800), {
      overflowStart: true,
      overflowEnd: false,
    });
  });
});
