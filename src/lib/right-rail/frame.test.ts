/**
 * The push/overlay ladder, pinned.
 *
 * `resolveRightRailFrame` is pure and DOM-free, so every number the design rests
 * on is provable here before a browser is opened. The worked cases below are the
 * ones actually measured against the running app at 1440 and 1920.
 *
 * Run: `npx tsx --test src/lib/right-rail/frame.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONTEXT_RAIL_PARKED_PX,
  MIN_WORK_SURFACE_PX,
  RIGHT_RAIL_GUTTER_PX,
  RIGHT_RAIL_PUSH_MIN_FRAME_PX,
  contextRailCostPx,
  resolveRightRailFrame,
} from './frame';

/** A route rail at its 360px default, plus its `m-2` gutters. */
const RAIL_OPEN = contextRailCostPx();

const base = {
  railCostOpenPx: RAIL_OPEN,
  railOperatorCollapsed: false,
  wantsPush: true,
  desiredWidthPx: 420,
};

describe('right-rail frame constants', () => {
  it('parked rail costs the strip plus both gutters', () => {
    assert.equal(CONTEXT_RAIL_PARKED_PX, 48);
    assert.equal(RAIL_OPEN, 376);
    assert.equal(RIGHT_RAIL_GUTTER_PX, 8);
    assert.equal(MIN_WORK_SURFACE_PX, 784);
  });

  it('the push threshold is derived, not a hand-picked breakpoint', () => {
    // work floor + panel gutters + the panel's own minimum, with the route rail
    // fully masked away (a push-park renders no strip — see `parkedLeftPx`).
    assert.equal(RIGHT_RAIL_PUSH_MIN_FRAME_PX, 784 + 16 + 360);
    assert.equal(RIGHT_RAIL_PUSH_MIN_FRAME_PX, 1160);
  });
});

describe('the ladder', () => {
  it('1920: pushes at rung 0 — nothing yields', () => {
    const r = resolveRightRailFrame({ ...base, frameWidthPx: 1920 });
    assert.equal(r.mode, 'push');
    assert.equal(r.parkRail, false, 'a 1920 frame has room without taking the rail away');
  });

  it('1440: pushes at rung 1 — the context rail parks', () => {
    // rung 0 surplus = 1440 - 376 - 784 - 16 = 264, short of the 420 wanted.
    // rung 1 surplus = 1440 -   0 - 784 - 16 = 640, which seats it in full.
    const r = resolveRightRailFrame({ ...base, frameWidthPx: 1440 });
    assert.equal(r.mode, 'push');
    assert.equal(r.parkRail, true);
  });

  it('1440 with no route rail: pushes at rung 0', () => {
    const r = resolveRightRailFrame({ ...base, frameWidthPx: 1440, railCostOpenPx: 0 });
    assert.equal(r.mode, 'push');
    assert.equal(r.parkRail, false, 'there is no rail to park');
  });

  it('1440 with the rail ALREADY parked by the operator: never re-parks it', () => {
    const r = resolveRightRailFrame({
      ...base,
      frameWidthPx: 1440,
      railOperatorCollapsed: true,
    });
    assert.equal(r.mode, 'push');
    assert.equal(
      r.parkRail,
      false,
      'the operator already parked it — masking it again would fight their own restore',
    );
  });

  it('takes a NARROWER panel over covering the work surface (pass B)', () => {
    // 1160 is exactly the minimum: rung 1 surplus == the panel's 360px floor.
    const at = resolveRightRailFrame({ ...base, frameWidthPx: RIGHT_RAIL_PUSH_MIN_FRAME_PX });
    assert.equal(at.mode, 'push');
    assert.equal(at.parkRail, true);
  });

  it('one pixel below the threshold, it honestly gives up and overlays', () => {
    const below = resolveRightRailFrame({
      ...base,
      frameWidthPx: RIGHT_RAIL_PUSH_MIN_FRAME_PX - 1,
    });
    assert.equal(below.mode, 'overlay');
    assert.equal(below.parkRail, false, 'an overlaying panel must not also steal the rail');
  });

  it('an occupant that opts out never pushes and never parks anything', () => {
    const r = resolveRightRailFrame({ ...base, frameWidthPx: 1920, wantsPush: false });
    assert.equal(r.mode, 'overlay');
    assert.equal(r.parkRail, false);
  });

  it('an unmeasured frame (SSR / first paint) overlays rather than guessing', () => {
    assert.equal(resolveRightRailFrame({ ...base, frameWidthPx: 0 }).mode, 'overlay');
    assert.equal(resolveRightRailFrame({ ...base, frameWidthPx: NaN }).mode, 'overlay');
  });
});

describe('the resize cap', () => {
  it('is measured against the FULLY-PARKED frame, so it cannot move mid-drag', () => {
    const open = resolveRightRailFrame({ ...base, frameWidthPx: 1440 });
    const parked = resolveRightRailFrame({
      ...base,
      frameWidthPx: 1440,
      railOperatorCollapsed: true,
    });
    const noRail = resolveRightRailFrame({ ...base, frameWidthPx: 1440, railCostOpenPx: 0 });
    assert.equal(open.capPx, 592);
    assert.equal(parked.capPx, 592, 'the cap must not depend on the park state it decides');
    assert.equal(noRail.capPx, 592);
  });

  it('never caps below the panel’s own minimum, however narrow the frame', () => {
    const r = resolveRightRailFrame({ ...base, frameWidthPx: 900 });
    assert.equal(r.mode, 'overlay');
    assert.equal(r.capPx, 360);
  });
});
