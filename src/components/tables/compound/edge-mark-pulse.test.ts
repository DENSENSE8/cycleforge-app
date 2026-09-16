import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { edgeMarkFlashOpacity, edgeMarkTravelY } from './edge-mark-pulse';

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

describe('edgeMarkFlashOpacity — a single mark breathes', () => {
  const duration = 2.1;

  it('is fully opaque at cycle start and cycle end', () => {
    assert.equal(edgeMarkFlashOpacity(0, duration), 1);
    assert.equal(edgeMarkFlashOpacity(duration * 1000, duration), 1);
  });

  it('dips to the floor at mid-cycle — never to invisible', () => {
    const mid = edgeMarkFlashOpacity((duration * 1000) / 2, duration);
    assert.ok(Math.abs(mid - 0.35) < 0.001, `mid was ${mid}`);
    assert.ok(mid > 0);
  });

  it('stays inside [floor, 1] across a whole cycle', () => {
    for (let ms = 0; ms <= duration * 1000; ms += 37) {
      const value = edgeMarkFlashOpacity(ms, duration);
      assert.ok(value >= 0.35 && value <= 1, `${ms}ms -> ${value}`);
    }
  });

  it('gives every row the same opacity at the same now', () => {
    const now = 9_876.5;
    assert.equal(edgeMarkFlashOpacity(now, duration), edgeMarkFlashOpacity(now, duration));
  });
});

describe('edgeMarkFlashOpacity — several marks take turns', () => {
  const duration = 2.1;
  const slot = duration * 1000;

  it('gives each mark its own slot and blanks the others', () => {
    // First slot belongs to mark 0, second to mark 1 — so the box shows the
    // bolt, then the triangle, never both.
    assert.equal(edgeMarkFlashOpacity(slot / 2, duration, 0, 2), 1);
    assert.equal(edgeMarkFlashOpacity(slot / 2, duration, 1, 2), 0);
    assert.equal(edgeMarkFlashOpacity(slot * 1.5, duration, 1, 2), 1);
    assert.equal(edgeMarkFlashOpacity(slot * 1.5, duration, 0, 2), 0);
  });

  it('fades fully out at every handover — no double paint', () => {
    for (const boundary of [0, slot, slot * 2]) {
      const total = edgeMarkFlashOpacity(boundary, duration, 0, 2) +
        edgeMarkFlashOpacity(boundary, duration, 1, 2);
      assert.equal(total, 0, `both marks must be invisible at ${boundary}ms`);
    }
  });

  it('never paints two marks at once, anywhere in the cycle', () => {
    for (let ms = 0; ms <= slot * 2; ms += 23) {
      const a = edgeMarkFlashOpacity(ms, duration, 0, 2);
      const b = edgeMarkFlashOpacity(ms, duration, 1, 2);
      assert.ok(a === 0 || b === 0, `${ms}ms painted both (${a}, ${b})`);
      assert.ok(a >= 0 && a <= 1 && b >= 0 && b <= 1);
    }
  });

  it('wraps: the same instant one full rotation later looks identical', () => {
    const now = 1_234.5;
    assert.equal(
      edgeMarkFlashOpacity(now, duration, 1, 2),
      edgeMarkFlashOpacity(now + slot * 2, duration, 1, 2),
    );
  });
});
