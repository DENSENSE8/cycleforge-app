/**
 * The N-pane constraint solver, pinned.
 *
 * Everything here is arithmetic on numbers — no React, no DOM, no store — so the
 * whole tiling budget is provable before a browser is opened. That is the same
 * property `frame.test.ts` has for the right rail, and it is why the solver was
 * built in isolation first.
 *
 * Run: `npx tsx --test src/lib/canvas/geometry.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SPLIT_RATIO_MAX,
  SPLIT_RATIO_MIN,
  clampSplitRatio,
  paneCapPx,
  paneRowMinFramePx,
  resolvePaneRow,
  splitRatioFromDrag,
  splitRatioFromFirstPx,
} from './geometry';

describe('paneCapPx — one pane’s ceiling beside the others', () => {
  it('is frame minus what the peers hold, floored at the pane’s own minimum', () => {
    // The desk inspector case from `frame.test.ts`: 1920 − rail 360 − floor 784.
    assert.equal(
      paneCapPx({ framePx: 1920, minPx: 360, reservedPx: [360, 784] }),
      776,
    );
    // 1440 leaves 296, which is under the 360 panel min — the floor wins.
    assert.equal(
      paneCapPx({ framePx: 1440, minPx: 360, reservedPx: [360, 784] }),
      360,
    );
  });

  it('charges the target pane’s own gutters, not the row’s', () => {
    assert.equal(
      paneCapPx({ framePx: 1000, minPx: 100, reservedPx: [400], gutterPx: 8, gutters: 2 }),
      1000 - 400 - 16,
    );
  });

  it('reads a non-finite or negative frame as zero rather than returning NaN', () => {
    // A NaN ceiling silently becomes a NaN width at the consumer's
    // `Math.min(width, cap)`. The floor is the honest answer for an unmeasured
    // frame — see the note in `right-rail/frame.ts`.
    assert.equal(paneCapPx({ framePx: Number.NaN, minPx: 360, reservedPx: [360] }), 360);
    assert.equal(paneCapPx({ framePx: -50, minPx: 360, reservedPx: [] }), 360);
  });
});

describe('paneRowMinFramePx', () => {
  it('sums the floors and charges one gutter per seam', () => {
    assert.equal(
      paneRowMinFramePx([
        { key: 'a', minPx: 784 },
        { key: 'b', minPx: 520 },
      ], 6),
      784 + 520 + 6,
    );
    assert.equal(paneRowMinFramePx([{ key: 'only', minPx: 400 }], 6), 400);
    assert.equal(paneRowMinFramePx([], 6), 0);
  });
});

describe('resolvePaneRow — weighted distribution', () => {
  it('splits an unconstrained row by weight, not by surplus', () => {
    // The distinction that keeps a sash where the operator dropped it: with
    // unequal floors, sharing only the SURPLUS would land a 0.7 ratio near 0.6.
    const solved = resolvePaneRow({
      framePx: 1914,
      panes: [
        { key: 'a', minPx: 784, weight: 0.7 },
        { key: 'b', minPx: 520, weight: 0.3 },
      ],
    });
    assert.equal(solved.fits, true);
    assert.equal(solved.panes[0].px, 1340); // 0.7 × 1914 = 1339.8
    assert.equal(solved.panes[1].px, 574);
    assert.equal(solved.panes[0].px + solved.panes[1].px, 1914);
  });

  it('returns integers whose sum is exactly the content width', () => {
    // Three-way splits are where naive rounding drifts and the last seam moves.
    const solved = resolvePaneRow({
      framePx: 1000,
      gutterPx: 6,
      panes: [
        { key: 'a', minPx: 100 },
        { key: 'b', minPx: 100 },
        { key: 'c', minPx: 100 },
      ],
    });
    const total = solved.panes.reduce((sum, pane) => sum + pane.px, 0);
    assert.equal(solved.contentPx, 1000 - 12);
    assert.equal(total, 988);
    assert.deepEqual(solved.panes.map((p) => p.px), [330, 329, 329]);
    // Offsets step by the pane width plus one gutter.
    assert.deepEqual(solved.panes.map((p) => p.offsetPx), [0, 336, 671]);
  });

  it('clamps a pane at its floor and re-shares what is left', () => {
    const solved = resolvePaneRow({
      framePx: 1000,
      panes: [
        { key: 'wide', minPx: 100, weight: 0.9 },
        { key: 'floored', minPx: 400, weight: 0.1 },
      ],
    });
    assert.equal(solved.panes[1].px, 400, 'the floor wins over the 0.1 weight');
    assert.equal(solved.panes[1].constrained, true);
    assert.equal(solved.panes[0].px, 600, 'the remainder goes to the unclamped pane');
    assert.equal(solved.panes[0].constrained, false);
  });

  it('clamps a pane at its ceiling and re-shares what is left', () => {
    const solved = resolvePaneRow({
      framePx: 1000,
      panes: [
        { key: 'capped', minPx: 100, maxPx: 300 },
        { key: 'elastic', minPx: 100 },
      ],
    });
    assert.equal(solved.panes[0].px, 300);
    assert.equal(solved.panes[0].constrained, true);
    assert.equal(solved.panes[1].px, 700);
  });

  it('parks the lowest yieldRank first, and only as far as it has to', () => {
    // 300 + 720 + 280 = 1300 needed; 1100 available. Parking the rail to its
    // 32px strip frees 268 and the row fits — the station ladder, generalized.
    const solved = resolvePaneRow({
      framePx: 1100,
      panes: [
        { key: 'rail', minPx: 300, parkedPx: 32, yieldRank: 0 },
        { key: 'center', minPx: 720, yieldRank: 5 },
        { key: 'displays', minPx: 280, parkedPx: 32, yieldRank: 1 },
      ],
    });
    assert.equal(solved.fits, true);
    assert.deepEqual(solved.parkedKeys, ['rail']);
    assert.equal(solved.panes[0].px, 32);
    assert.equal(solved.panes[0].parked, true);
    assert.equal(solved.panes[2].parked, false, 'Displays never had to yield');
  });

  it('parks a second pane only when the first was not enough', () => {
    const solved = resolvePaneRow({
      framePx: 800,
      panes: [
        { key: 'rail', minPx: 300, parkedPx: 32, yieldRank: 0 },
        { key: 'center', minPx: 720, yieldRank: 5 },
        { key: 'displays', minPx: 280, parkedPx: 32, yieldRank: 1 },
      ],
    });
    assert.deepEqual(solved.parkedKeys, ['rail', 'displays']);
    assert.equal(solved.fits, true);
    assert.equal(solved.panes[1].px, 736, 'the center absorbs everything freed');
  });

  it('reports a shortfall instead of crushing panes below their floors', () => {
    // This is the input D4 turns into a LAYOUT change, so the solver must not
    // paper over it by shrinking someone.
    const solved = resolvePaneRow({
      framePx: 1200,
      gutterPx: 6,
      panes: [
        { key: 'session-a', minPx: 784 },
        { key: 'session-b', minPx: 784 },
      ],
    });
    assert.equal(solved.fits, false);
    assert.equal(solved.shortfallPx, 784 * 2 - (1200 - 6));
    assert.deepEqual(solved.panes.map((p) => p.px), [784, 784]);
  });

  it('an empty row and an unmeasured frame are both total, not thrown', () => {
    assert.deepEqual(resolvePaneRow({ framePx: 1000, panes: [] }).panes, []);
    const unmeasured = resolvePaneRow({
      framePx: Number.NaN,
      panes: [{ key: 'a', minPx: 100 }],
    });
    assert.equal(unmeasured.contentPx, 0);
    assert.equal(unmeasured.fits, false);
    assert.equal(unmeasured.panes[0].px, 100);
  });

  it('a weightless pane holds its floor and never takes an equal share', () => {
    const solved = resolvePaneRow({
      framePx: 1000,
      panes: [
        { key: 'fixed', minPx: 240, weight: 0 },
        { key: 'elastic', minPx: 100 },
      ],
    });
    assert.equal(solved.panes[0].px, 240);
    assert.equal(solved.panes[1].px, 760);
  });
});

describe('splitRatioFromDrag — px space, not ratio space', () => {
  const base = { availablePx: 1000, firstMinPx: 200, secondMinPx: 200 };

  it('tracks the pointer 1:1 while nothing is pinned', () => {
    assert.equal(splitRatioFromDrag({ ...base, startRatio: 0.5, deltaPx: 100 }), 0.6);
    assert.equal(splitRatioFromDrag({ ...base, startRatio: 0.5, deltaPx: -150 }), 0.35);
  });

  it('stops at the far pane’s floor instead of sliding under it', () => {
    // Dragging 400px right would leave the second pane 100px — under its 200
    // floor — so the seam stops at 800/1000.
    assert.equal(splitRatioFromDrag({ ...base, startRatio: 0.5, deltaPx: 400 }), 0.8);
    assert.equal(splitRatioFromDrag({ ...base, startRatio: 0.5, deltaPx: -400 }), 0.2);
  });

  it('refuses to move when the row has no room to redistribute', () => {
    // 380 available against 200 + 200 of floors: the LAYOUT has to change, and
    // that is the host's call, not the sash's.
    assert.equal(
      splitRatioFromDrag({ ...base, availablePx: 380, startRatio: 0.5, deltaPx: 90 }),
      0.5,
    );
  });

  it('never returns a ratio that paints a pane to nothing', () => {
    assert.equal(
      splitRatioFromDrag({
        availablePx: 1000,
        firstMinPx: 0,
        secondMinPx: 0,
        startRatio: 0.5,
        deltaPx: -900,
      }),
      SPLIT_RATIO_MIN,
    );
    assert.equal(clampSplitRatio(2), SPLIT_RATIO_MAX);
    assert.equal(clampSplitRatio(Number.NaN), 0.5);
  });

  it('shares one clamp with the pointer path, so keys and drags stop together', () => {
    // The pointer produces a first-pane px directly (a sash is that pane's
    // trailing edge); the keyboard produces a delta. Both land on the same stop.
    const byPx = splitRatioFromFirstPx({
      firstPx: 900,
      availablePx: 1000,
      firstMinPx: 200,
      secondMinPx: 200,
      fallbackRatio: 0.5,
    });
    const byDelta = splitRatioFromDrag({ ...base, startRatio: 0.5, deltaPx: 400 });
    assert.equal(byPx, byDelta);
    assert.equal(byPx, 0.8);
  });
});
