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
import { CONTEXT_PANEL_RESIZE } from '@/lib/sidebar/context-panel-column';
import {
  STATION_COLUMN_BUDGET,
  STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX,
  STATION_DISPLAYS_MIN_WIDTH_PX,
  STATION_WORKBENCH_LOCK_PX,
} from '@/lib/station/workbench-layout';
import {
  CONTEXT_RAIL_PARKED_PX,
  MIN_WORK_SURFACE_PX,
  RIGHT_RAIL_GUTTER_PX,
  RIGHT_RAIL_PUSH_MIN_FRAME_PX,
  STATION_PUSH_CENTER_FLOOR_PX,
  contextRailCostPx,
  getRightRailFrame,
  resolveRightRailFrame,
  resolveStationDisplaysCollapse,
  setRightRailContextRail,
  setRightRailFrameWidth,
  setStationContextSashArmed,
  setStationDisplaysSashArmed,
  setStationDisplaysSashDragging,
  setStationPushDemand,
  stationContextSashMaxPx,
  stationDisplaysSashMaxPx,
  subscribeStationFarRailRequest,
} from './frame';

const LEFT_MIN = CONTEXT_PANEL_RESIZE.minWidthPx; // 300
const DISPLAYS_MIN = STATION_DISPLAYS_MIN_WIDTH_PX; // 280
const FLOOR = STATION_PUSH_CENTER_FLOOR_PX; // 720

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

describe('Displays prefers parking the left rail; parks itself only when still unfit', () => {
  it('the pure resolver parks Displays against the yielded (parked-strip) left cost', () => {
    // Parked left strip (32): close < 1032, reopen ≥ 1064.
    const open = (frameWidthPx: number, wasCollapsed: boolean) =>
      resolveStationDisplaysCollapse({
        frameWidthPx,
        leftCostPx: CONTEXT_RAIL_PARKED_PX,
        wasCollapsed,
      });
    assert.equal(open(1920, false), false);
    assert.equal(open(1200, false), false, '1200 seats Displays beside a parked left');
    assert.equal(open(1031, false), true, 'parks below parked-left fit threshold');
    assert.equal(open(1050, true), true, 'stays parked in the deadband');
    assert.equal(open(1064, true), false, 'reopens only past the deadband');
    // Open-rail-at-min diagnostic sum stays 300 + 720 + 280.
    assert.equal(STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX, LEFT_MIN + FLOOR + DISPLAYS_MIN);
  });

  it('the store parks Displays only when even a parked left cannot seat it', () => {
    // Rail open at 360. Prefer parking left — Displays stays open down to ~1032.
    setRightRailContextRail({ railCostOpenPx: 360, railOperatorCollapsed: false });
    setStationPushDemand({ active: true, desiredWidthPx: 420 });
    setRightRailFrameWidth(1920);
    assert.equal(getRightRailFrame().stationDisplaysCollapsed, false);
    setRightRailFrameWidth(1200);
    assert.equal(
      getRightRailFrame().stationDisplaysCollapsed,
      false,
      '1200 keeps Displays open (left yields first)',
    );
    setRightRailFrameWidth(1000);
    assert.equal(
      getRightRailFrame().stationDisplaysCollapsed,
      true,
      'parks Displays only below parked-left + 720 + 280',
    );
    setRightRailFrameWidth(1050); // deadband [1032, 1064)
    assert.equal(getRightRailFrame().stationDisplaysCollapsed, true, 'hysteresis holds');
    setRightRailFrameWidth(1064);
    assert.equal(getRightRailFrame().stationDisplaysCollapsed, false, 'reopens past deadband');
    setStationPushDemand({ active: false, desiredWidthPx: 420 });
    setRightRailFrameWidth(1920);
    assert.equal(getRightRailFrame().stationDisplaysCollapsed, false);
  });

  it('opening Displays on a tight frame requests collapse-context (park left)', () => {
    const seen: string[] = [];
    const unsub = subscribeStationFarRailRequest((req) => {
      seen.push(req);
    });
    setRightRailContextRail({ railCostOpenPx: 360, railOperatorCollapsed: false });
    setRightRailFrameWidth(1200); // 360+720+280 = 1360 — too tight with left open
    setStationPushDemand({ active: true, desiredWidthPx: 420 });
    assert.ok(
      seen.includes('collapse-context'),
      'must park the left rail so Displays can stay open',
    );
    assert.equal(
      getRightRailFrame().stationDisplaysCollapsed,
      false,
      'Displays itself stays open while left yields',
    );
    unsub();
    setStationPushDemand({ active: false, desiredWidthPx: 420 });
    setRightRailFrameWidth(1920);
  });
});

describe('Option A — local sash clamps + the budget is sourced (no coupling)', () => {
  it('the min-fit budget hardMins ARE the live layout constants', () => {
    assert.equal(STATION_COLUMN_BUDGET.context.hardMinPx, LEFT_MIN);
    assert.equal(STATION_COLUMN_BUDGET.primary.hardMinPx, STATION_WORKBENCH_LOCK_PX);
    assert.equal(STATION_COLUMN_BUDGET.displays.hardMinPx, DISPLAYS_MIN);
    assert.equal(
      STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX,
      STATION_COLUMN_BUDGET.context.hardMinPx +
        STATION_COLUMN_BUDGET.primary.hardMinPx +
        STATION_COLUMN_BUDGET.displays.hardMinPx,
    );
  });

  it('the Displays sash caps at frame − leftCost − 720, floored at its 280 min', () => {
    assert.equal(stationDisplaysSashMaxPx(1680, 360), 1680 - 360 - FLOOR); // 600
    assert.equal(stationDisplaysSashMaxPx(1680, 32), 1680 - 32 - FLOOR); // parked rail → roomier
    // Never below the station min (unlike the desk capPx's 360 floor).
    assert.equal(stationDisplaysSashMaxPx(1010, 300), DISPLAYS_MIN);
  });

  it('the context sash caps at frame − displays − 720, floored at its 300 min', () => {
    assert.equal(stationContextSashMaxPx(1680, 420), 1680 - 420 - FLOOR); // 540
    assert.equal(stationContextSashMaxPx(1680, 900), LEFT_MIN); // frame − 900 − 720 = 60 → floored to 300
    assert.equal(stationContextSashMaxPx(1010, 300), LEFT_MIN);
  });

  it('the two clamps are mutually consistent — neither sash can force the peer to shrink', () => {
    // A rail at its context-sash MAX leaves the Displays cap at exactly the
    // current Displays width (never below it), so widening the rail never
    // force-shrinks Displays — the center absorbed it all. And vice-versa.
    const frame = 1680;
    const displays = 500;
    const leftAtMax = stationContextSashMaxPx(frame, displays); // frame − 500 − 720 = 460
    assert.equal(stationDisplaysSashMaxPx(frame, leftAtMax), displays, 'Displays cap = its own width');

    const left = 420;
    const displaysAtMax = stationDisplaysSashMaxPx(frame, left); // frame − 420 − 720 = 540
    assert.equal(stationContextSashMaxPx(frame, displaysAtMax), left, 'context cap = its own width');
  });

  it('the store flips the sash caps directionally when the Displays sash drags (the cascade)', () => {
    setRightRailContextRail({ railCostOpenPx: 360, railOperatorCollapsed: false });
    setStationPushDemand({ active: true, desiredWidthPx: 420 });

    // Idle: the LEFT rail is authority. Displays cap is TIGHT (yields into the
    // leftover — opening it never shrinks the rail); context cap is LOOSE (its
    // sash may grow to the ladder max, and Displays yields).
    setStationDisplaysSashDragging(false);
    setRightRailFrameWidth(1680);
    let s = getRightRailFrame();
    assert.equal(s.stationDisplaysCapPx, 1680 - 360 - FLOOR, 'idle: Displays cap tight (frame − leftCost − 720)');
    assert.equal(s.stationContextCapPx, 1680 - DISPLAYS_MIN - FLOOR, 'idle: context cap loose (frame − 280 − 720)');

    // Displays DRAGGING: its cap opens to the ladder max (frame − 300 − 720) so
    // it can grow past the center floor; the context cap goes TIGHT
    // (frame − displays − 720) so the left rail yields via its own resize-clamp.
    setStationDisplaysSashDragging(true);
    s = getRightRailFrame();
    assert.equal(s.stationDisplaysCapPx, 1680 - LEFT_MIN - FLOOR, 'dragging: Displays cap loose (rail at its 300 min)');
    assert.equal(s.stationContextCapPx, 1680 - 420 - FLOOR, 'dragging: context cap tight (rail yields to Displays)');

    // Stage 3: once the operator PARKS the rail (from a drag overshoot), the
    // loose Displays cap GROWS from `F − 300 − 720` to `F − 32 − 720` so the drag
    // keeps going into the freed strip space.
    setRightRailContextRail({ railCostOpenPx: 360, railOperatorCollapsed: true });
    s = getRightRailFrame();
    assert.equal(
      s.stationDisplaysCapPx,
      1680 - CONTEXT_RAIL_PARKED_PX - FLOOR,
      'dragging + rail parked: Displays cap grows to F − 32 − 720',
    );

    // Reset the singleton so nothing downstream inherits the drag/push state.
    setStationDisplaysSashDragging(false);
    setRightRailContextRail({ railCostOpenPx: 360, railOperatorCollapsed: false });
    setStationPushDemand({ active: false, desiredWidthPx: 420 });
    setRightRailFrameWidth(1920);
  });

  it('relays each sash arm-to-close into the snapshot independently (no stomp)', () => {
    assert.equal(getRightRailFrame().stationDisplaysSashArmed, false);
    assert.equal(getRightRailFrame().stationContextSashArmed, false);

    // Displays sash arms → only its field flips; the reverse stays clear so an
    // idle context-rail publish cannot stomp it.
    setStationDisplaysSashArmed(true);
    assert.equal(getRightRailFrame().stationDisplaysSashArmed, true);
    assert.equal(getRightRailFrame().stationContextSashArmed, false);

    // The reverse arm is a separate field with its own writer.
    setStationContextSashArmed(true);
    assert.equal(getRightRailFrame().stationDisplaysSashArmed, true);
    assert.equal(getRightRailFrame().stationContextSashArmed, true);

    // Reset.
    setStationDisplaysSashArmed(false);
    setStationContextSashArmed(false);
    assert.equal(getRightRailFrame().stationDisplaysSashArmed, false);
    assert.equal(getRightRailFrame().stationContextSashArmed, false);
  });
});
