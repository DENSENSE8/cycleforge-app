/**
 * Station three-column yield ladder — the frame budget, proved before a browser
 * opens. `resolveStationYieldLadder` is pure and DOM-free, so invariants I1–I7
 * are asserted across a frame sweep and both prior states here, and the
 * hysteresis deadband is pinned so a manual drag near the boundary cannot flap.
 *
 * Precedent for the priority/threshold model: SAP Fiori Flexible Column Layout
 * (columns collapse by a defined priority order) and Material 3 supporting-pane
 * collapse (the supporting pane yields before the primary is squeezed).
 *
 * Run: `npx tsx --test src/lib/right-rail/station-yield-ladder.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTEXT_PANEL_RESIZE } from '@/components/sidebar/context-panel-column';
import {
  STATION_COLUMN_BUDGET,
  STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX,
  STATION_DISPLAYS_AUTO_CLOSE_HYSTERESIS_PX,
  STATION_DISPLAYS_MIN_WIDTH_PX,
  STATION_WORKBENCH_LOCK_PX,
} from '@/components/station/workbench/workbench-layout';
import {
  resolveStationYieldLadder,
  stationLadderMaxContextPx,
  stationLadderMaxDisplaysPx,
} from './station-dual-rail';

type StationYieldLadderResult = ReturnType<typeof resolveStationYieldLadder>;

const LEFT_HARD_MIN = STATION_COLUMN_BUDGET.context.hardMinPx; // 300
const DISPLAYS_HARD_MIN = STATION_COLUMN_BUDGET.displays.hardMinPx; // 280
const MIDDLE_LOCK = STATION_COLUMN_BUDGET.primary.hardMinPx; // 720

describe('the column budget is sourced, not duplicated (I7 — walls are the live constants)', () => {
  it('station hardMins ARE the layout constants', () => {
    assert.equal(STATION_COLUMN_BUDGET.context.hardMinPx, CONTEXT_PANEL_RESIZE.minWidthPx);
    assert.equal(STATION_COLUMN_BUDGET.primary.hardMinPx, STATION_WORKBENCH_LOCK_PX);
    assert.equal(STATION_COLUMN_BUDGET.displays.hardMinPx, STATION_DISPLAYS_MIN_WIDTH_PX);
    // Primary is Locked; Displays yields first; context yields second.
    assert.equal(STATION_COLUMN_BUDGET.primary.shrinkPriority, 0);
    assert.equal(STATION_COLUMN_BUDGET.displays.shrinkPriority, 1);
    assert.equal(STATION_COLUMN_BUDGET.context.shrinkPriority, 2);
    // Displays is the leftover-filler (flex-1).
    assert.equal(STATION_COLUMN_BUDGET.displays.preferredPx, 'fill');
  });

  it('the auto-close threshold is the derived min-fit sum (300 + 720 + 280)', () => {
    assert.equal(
      STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX,
      LEFT_HARD_MIN + MIDDLE_LOCK + DISPLAYS_HARD_MIN,
    );
    assert.equal(STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX, 1300);
  });
});

/** Assert every ladder invariant that must hold for a rail-open station frame. */
function assertLadderInvariants(frame: number, r: StationYieldLadderResult): void {
  // I1 — context never closes here; it yields toward its wall.
  assert.ok(r.leftPx >= LEFT_HARD_MIN, `I1 left ${r.leftPx} >= ${LEFT_HARD_MIN} @${frame}`);
  // I2 — the 720 lock is never crushed (shrinkPriority 0).
  assert.ok(r.middlePx >= MIDDLE_LOCK, `I2 middle ${r.middlePx} >= ${MIDDLE_LOCK} @${frame}`);
  // I3 / I6 — a shrinkable pane never computes below its hardMin while OPEN.
  assert.ok(
    r.displaysPx >= DISPLAYS_HARD_MIN || r.displaysState === 'CLOSED',
    `I3/I6 displays ${r.displaysPx} < ${DISPLAYS_HARD_MIN} while OPEN @${frame}`,
  );
  // I4 — the three columns never sum past the frame.
  assert.ok(
    r.leftPx + r.middlePx + r.displaysPx <= frame + 1e-9,
    `I4 sum ${r.leftPx + r.middlePx + r.displaysPx} > ${frame}`,
  );
  // I5 — OPEN is an EXACT fill against the locked middle.
  if (r.displaysState === 'OPEN') {
    assert.equal(
      r.leftPx + MIDDLE_LOCK + r.displaysPx,
      frame,
      `I5 exact fill @${frame}`,
    );
  }
}

describe('resolveStationYieldLadder — I1–I7 across the frame sweep', () => {
  // Frames the mandate calls out: wide bench, laptop, the boundary, and the two
  // sides of it. Kept >= 1024 (below ~1020 even context + lock cannot coexist —
  // the 2-column / overlay regime, out of the three-column ladder's scope).
  const FRAMES = [2560, 1920, 1400, 1332, 1300, 1299, 1200, 1100, 1024];
  const PRIORS = [false, true]; // wasDisplaysCollapsed
  const LEFT_PREFS = [LEFT_HARD_MIN, 360, 700];

  for (const frame of FRAMES) {
    for (const wasDisplaysCollapsed of PRIORS) {
      for (const leftPreferredPx of LEFT_PREFS) {
        it(`frame ${frame} · was${wasDisplaysCollapsed ? 'Collapsed' : 'Open'} · leftPref ${leftPreferredPx}`, () => {
          const r = resolveStationYieldLadder({
            frameWidthPx: frame,
            leftPreferredPx,
            wasDisplaysCollapsed,
          });
          assertLadderInvariants(frame, r);
        });
      }
    }
  }

  it('an unmeasured frame (0) never crushes — echoes prefs at the walls', () => {
    const r = resolveStationYieldLadder({
      frameWidthPx: 0,
      leftPreferredPx: 360,
      wasDisplaysCollapsed: false,
    });
    assert.equal(r.middlePx, MIDDLE_LOCK);
    assert.ok(r.leftPx >= LEFT_HARD_MIN);
  });
});

describe('Displays yields FIRST; context yields SECOND', () => {
  it('a wide frame keeps the operator left and grows Displays (leftover)', () => {
    const r = resolveStationYieldLadder({
      frameWidthPx: 1920,
      leftPreferredPx: 360,
      wasDisplaysCollapsed: false,
    });
    assert.equal(r.displaysState, 'OPEN');
    assert.equal(r.leftPx, 360, 'operator left preserved');
    assert.equal(r.displaysPx, 1920 - MIDDLE_LOCK - 360, 'Displays absorbs the leftover');
  });

  it('near the boundary context yields to keep Displays at its min', () => {
    const r = resolveStationYieldLadder({
      frameWidthPx: 1300,
      leftPreferredPx: 360, // wants 360 but must yield to 300
      wasDisplaysCollapsed: false,
    });
    assert.equal(r.displaysState, 'OPEN');
    assert.equal(r.leftPx, LEFT_HARD_MIN, 'context yielded to its wall');
    assert.equal(r.displaysPx, DISPLAYS_HARD_MIN, 'Displays held at its min');
  });

  it('below the threshold Displays CLOSES rather than crushing anyone', () => {
    const r = resolveStationYieldLadder({
      frameWidthPx: 1299,
      leftPreferredPx: 360,
      wasDisplaysCollapsed: false,
    });
    assert.equal(r.displaysState, 'CLOSED');
    assert.equal(r.displaysPx, 0);
    assert.ok(r.middlePx >= MIDDLE_LOCK, 'middle never crushed');
    assert.ok(r.leftPx >= LEFT_HARD_MIN, 'context never crushed');
  });
});

describe('hysteresis deadband — no flap near 1300', () => {
  const HYST = STATION_DISPLAYS_AUTO_CLOSE_HYSTERESIS_PX; // 16
  const CLOSE_AT = STATION_DISPLAYS_AUTO_CLOSE_FRAME_PX; // 1300
  const REOPEN_AT = CLOSE_AT + HYST * 2; // 1332

  it('close edge is hard at the fit threshold (I6)', () => {
    // Open at 1300 (fits exactly); closed at 1299.
    assert.equal(
      resolveStationYieldLadder({ frameWidthPx: CLOSE_AT, leftPreferredPx: 360, wasDisplaysCollapsed: false })
        .displaysState,
      'OPEN',
    );
    assert.equal(
      resolveStationYieldLadder({ frameWidthPx: CLOSE_AT - 1, leftPreferredPx: 360, wasDisplaysCollapsed: false })
        .displaysState,
      'CLOSED',
    );
  });

  it('a collapsed Displays stays collapsed across the whole deadband', () => {
    for (const frame of [CLOSE_AT, CLOSE_AT + 8, REOPEN_AT - 1]) {
      assert.equal(
        resolveStationYieldLadder({ frameWidthPx: frame, leftPreferredPx: 360, wasDisplaysCollapsed: true })
          .displaysState,
        'CLOSED',
        `sticky-collapsed @${frame}`,
      );
    }
    // Reopens only once the frame clears the full deadband.
    assert.equal(
      resolveStationYieldLadder({ frameWidthPx: REOPEN_AT, leftPreferredPx: 360, wasDisplaysCollapsed: true })
        .displaysState,
      'OPEN',
    );
  });

  it('parking the context rail lets Displays survive to a narrower frame', () => {
    // minLeft = strip (32) instead of 300 → threshold drops to 32+720+280 = 1032.
    const r = resolveStationYieldLadder({
      frameWidthPx: 1100,
      leftPreferredPx: 32,
      wasDisplaysCollapsed: false,
      minLeftPx: 32,
      leftHardMinPx: 32,
    });
    assert.equal(r.displaysState, 'OPEN', 'parked rail keeps Displays open at 1100');
  });
});

describe('ladder-consistent sash caps (kill the edge write-back jitter)', () => {
  it('the Displays cap is the full range with context at its wall', () => {
    assert.equal(stationLadderMaxDisplaysPx(1920), Math.max(280, 1920 - 720 - 300)); // 900
    assert.equal(stationLadderMaxDisplaysPx(1300), 280);
  });

  it('the context cap is the full range with Displays at its wall', () => {
    assert.equal(stationLadderMaxContextPx(1920), Math.max(300, 1920 - 720 - 280)); // 920
    assert.equal(stationLadderMaxContextPx(1300), 300);
  });

  it('a Displays width at its ladder cap resolves to left at the wall — no clamp fight', () => {
    const frame = 1920;
    const displaysAtCap = stationLadderMaxDisplaysPx(frame); // 900
    const r = resolveStationYieldLadder({
      frameWidthPx: frame,
      leftPreferredPx: frame - MIDDLE_LOCK - displaysAtCap, // 300 (what the sash would drive)
      wasDisplaysCollapsed: false,
    });
    assert.equal(r.leftPx, LEFT_HARD_MIN);
    assert.equal(r.displaysPx, displaysAtCap, 'Displays reaches its cap with no clamp-back');
  });
});
