/**
 * The always-inline push budget, pinned.
 *
 * `resolveRightRailFrame` is pure and DOM-free, so every number the design rests
 * on is provable here before a browser is opened. The worked cases below are the
 * ones actually measured against the running app at 1440 and 1920.
 *
 * Run: `npx tsx --test src/lib/right-rail/frame.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STATION_WORKBENCH_LOCK_PX } from '@/components/station/workbench/workbench-layout';
import {
  CONTEXT_RAIL_PARKED_PX,
  MIN_WORK_SURFACE_PX,
  RIGHT_RAIL_GUTTER_PX,
  RIGHT_RAIL_PUSH_MIN_FRAME_PX,
  STATION_PUSH_CENTER_FLOOR_PX,
  contextRailCostPx,
  getStationDisplaysCollapsed,
  resolveRightRailFrame,
  resolveStationDisplaysCollapse,
  setRightRailContextRail,
  setRightRailFrameWidth,
} from './frame';

/** A route rail at its 360px default (flush — no outer gutter islands). */
const RAIL_OPEN = contextRailCostPx();

const desk = {
  railCostOpenPx: RAIL_OPEN,
  railOperatorCollapsed: false,
  wantsPush: true,
  centerFloorPx: MIN_WORK_SURFACE_PX,
};

const station = {
  railCostOpenPx: RAIL_OPEN,
  railOperatorCollapsed: false,
  wantsPush: true,
  centerFloorPx: STATION_PUSH_CENTER_FLOOR_PX,
};

describe('right-rail frame constants', () => {
  it('operator-collapsed strip costs the strip only (flush planes — no margin islands)', () => {
    assert.equal(CONTEXT_RAIL_PARKED_PX, 32);
    assert.equal(RAIL_OPEN, 360);
    assert.equal(RIGHT_RAIL_GUTTER_PX, 0);
    assert.equal(MIN_WORK_SURFACE_PX, 784);
    assert.equal(STATION_WORKBENCH_LOCK_PX, 720);
    assert.equal(STATION_PUSH_CENTER_FLOOR_PX, STATION_WORKBENCH_LOCK_PX);
    assert.equal(STATION_PUSH_CENTER_FLOOR_PX, 720);
  });

  it('the unconstrained-fit threshold is derived, not a hand-picked breakpoint', () => {
    // work floor + panel gutters (0) + the panel's own minimum (no left rail).
    assert.equal(RIGHT_RAIL_PUSH_MIN_FRAME_PX, 784 + 0 + 360);
    assert.equal(RIGHT_RAIL_PUSH_MIN_FRAME_PX, 1144);
  });
});

describe('desk inspector budget — left rail stays open', () => {
  it('1920: pushes; left stays; cap leaves the center floor', () => {
    // surplus = 1920 − 360 − 784 = 776 ≥ default 420
    const r = resolveRightRailFrame({ ...desk, frameWidthPx: 1920 });
    assert.equal(r.mode, 'push');
    assert.equal(r.capPx, 776);
  });

  it('1440: pushes without parking the context rail; right caps to panel min', () => {
    // surplus = 1440 − 360 − 784 = 296 < panel min 360 → cap floors at 360.
    const r = resolveRightRailFrame({ ...desk, frameWidthPx: 1440 });
    assert.equal(r.mode, 'push');
    assert.equal(r.capPx, 360);
  });

  it('1440 with no route rail: wider cap (full frame minus floor)', () => {
    const r = resolveRightRailFrame({ ...desk, frameWidthPx: 1440, railCostOpenPx: 0 });
    assert.equal(r.mode, 'push');
    assert.equal(r.capPx, 1440 - 784);
  });

  it('1440 with the rail ALREADY collapsed by the operator: cap vs strip, not open card', () => {
    const r = resolveRightRailFrame({
      ...desk,
      frameWidthPx: 1440,
      railOperatorCollapsed: true,
    });
    assert.equal(r.mode, 'push');
    assert.equal(r.capPx, 1440 - CONTEXT_RAIL_PARKED_PX - 784);
  });

  it('an occupant that opts out never pushes', () => {
    const r = resolveRightRailFrame({ ...desk, frameWidthPx: 1920, wantsPush: false });
    assert.equal(r.mode, 'overlay');
  });

  it('an unmeasured frame never flashes the historical floating card', () => {
    assert.equal(resolveRightRailFrame({ ...desk, frameWidthPx: 0 }).mode, 'push');
    assert.equal(resolveRightRailFrame({ ...desk, frameWidthPx: NaN }).mode, 'push');
  });
});

describe('station Displays budget — center floor 720 (middle lock)', () => {
  it('1440: right caps to frame minus open left minus 720 lock', () => {
    // surplus = 1440 − 360 − 720 = 360
    const r = resolveRightRailFrame({ ...station, frameWidthPx: 1440 });
    assert.equal(r.mode, 'push');
    assert.equal(r.capPx, 1440 - 360 - 720);
  });

  it('1920: Displays cap leaves the 720 middle beside an open left rail', () => {
    // surplus = 1920 − 360 − 720 = 840
    const r = resolveRightRailFrame({ ...station, frameWidthPx: 1920 });
    assert.equal(r.mode, 'push');
    assert.equal(r.capPx, 1920 - 360 - 720);
  });

  it('no left rail: Displays caps to frame minus 720 lock', () => {
    const r = resolveRightRailFrame({
      ...station,
      frameWidthPx: 1440,
      railCostOpenPx: 0,
    });
    assert.equal(r.mode, 'push');
    assert.equal(r.capPx, 1440 - 720);
  });
});

describe('the resize cap', () => {
  it('desk: tracks the open left cost against MIN_WORK_SURFACE', () => {
    const open = resolveRightRailFrame({ ...desk, frameWidthPx: 1440 });
    const collapsed = resolveRightRailFrame({
      ...desk,
      frameWidthPx: 1440,
      railOperatorCollapsed: true,
    });
    const noRail = resolveRightRailFrame({ ...desk, frameWidthPx: 1440, railCostOpenPx: 0 });
    assert.equal(open.capPx, 360, 'open left → tight cap (panel min floor)');
    assert.equal(collapsed.capPx, 624, 'operator strip → roomier cap');
    assert.equal(noRail.capPx, 656);
  });

  it('never caps below the panel’s own minimum, however narrow the frame', () => {
    const r = resolveRightRailFrame({ ...desk, frameWidthPx: 900 });
    assert.equal(r.mode, 'push');
    assert.equal(r.capPx, 360);
  });
});

describe('reactive Displays-collapse slice (Fiori/M3 — the store latches hysteresis)', () => {
  it('the pure resolver reopens only after the full deadband', () => {
    // Rail open (minLeft 300): close < 1300, reopen ≥ 1332.
    const open = (frameWidthPx: number, wasCollapsed: boolean) =>
      resolveStationDisplaysCollapse({ frameWidthPx, minLeftPx: 300, wasCollapsed });
    assert.equal(open(1920, false), false);
    assert.equal(open(1299, false), true, 'closes below the fit threshold');
    assert.equal(open(1320, true), true, 'stays collapsed in the deadband');
    assert.equal(open(1332, true), false, 'reopens only past the deadband');
    // Parking the rail (strip 32) lowers the threshold so Displays survives narrower.
    assert.equal(
      resolveStationDisplaysCollapse({ frameWidthPx: 1200, minLeftPx: 32, wasCollapsed: true }),
      false,
      'parked rail keeps Displays open at 1200',
    );
  });

  it('the store publishes the flag off a frame measurement (singleton — drive it in order)', () => {
    setRightRailContextRail({ railCostOpenPx: 360, railOperatorCollapsed: false });
    setRightRailFrameWidth(1920);
    assert.equal(getStationDisplaysCollapsed(), false);
    setRightRailFrameWidth(1200);
    assert.equal(getStationDisplaysCollapsed(), true, 'collapses at 1200');
    setRightRailFrameWidth(1320); // inside the deadband
    assert.equal(getStationDisplaysCollapsed(), true, 'hysteresis holds it collapsed');
    setRightRailFrameWidth(1400);
    assert.equal(getStationDisplaysCollapsed(), false, 'reopens above the deadband');
    // Reset the singleton so nothing downstream inherits the sticky state.
    setRightRailFrameWidth(1920);
    assert.equal(getStationDisplaysCollapsed(), false);
  });
});
