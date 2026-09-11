import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { edgeMarkTravelY } from './edge-mark-pulse';

describe('edgeMarkTravelY — one clock for every rail', () => {
  const travel = 47;
  const duration = 4.2;

  it('is 0 at cycle start and cycle end', () => {
    assert.equal(edgeMarkTravelY(0, travel, duration), 0);
    assert.equal(edgeMarkTravelY(duration * 1000, travel, duration), 0);
  });

  it('peaks at mid-cycle', () => {
    const mid = edgeMarkTravelY((duration * 1000) / 2, travel, duration);
    assert.ok(Math.abs(mid - travel) < 0.001);
  });

  it('gives the same y to every caller at the same now', () => {
    const now = 12_345.6;
    assert.equal(edgeMarkTravelY(now, travel, duration), edgeMarkTravelY(now, travel, duration));
  });
});
