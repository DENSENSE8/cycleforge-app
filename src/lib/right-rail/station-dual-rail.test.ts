/**
 * Station dual-rail inverse-delta math — pure, DOM-free.
 * Reserves the 720 middle lock: left' + 720 + displays' === frame.
 *
 * Run: `npx tsx --test src/lib/right-rail/station-dual-rail.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTEXT_PANEL_RESIZE } from '@/components/sidebar/context-panel-column';
import {
  STATION_DISPLAYS_MIN_WIDTH_PX,
  STATION_WORKBENCH_LOCK_PX,
} from '@/components/station/workbench/workbench-layout';
import { resolveStationDualRailDelta } from './station-dual-rail';

const LEFT_MIN = CONTEXT_PANEL_RESIZE.minWidthPx; // 300
const DISPLAYS_MIN = STATION_DISPLAYS_MIN_WIDTH_PX; // 280
const MIDDLE = STATION_WORKBENCH_LOCK_PX; // 720

function assertFill(
  frame: number,
  r: { leftPx: number; displaysPx: number },
): void {
  assert.equal(r.leftPx + MIDDLE + r.displaysPx, frame);
}

describe('resolveStationDualRailDelta', () => {
  it('Displays grow shrinks context; middle lock preserved', () => {
    const frame = 1920;
    const r = resolveStationDualRailDelta({
      frameWidthPx: frame,
      leftPx: 560,
      displaysPx: 640,
      deltaPx: 100,
      primary: 'displays',
    });
    assert.equal(r.displaysPx, 740);
    assert.equal(r.leftPx, 460);
    assertFill(frame, r);
  });

  it('Displays shrink widens context; middle lock preserved', () => {
    const frame = 1440;
    const r = resolveStationDualRailDelta({
      frameWidthPx: frame,
      leftPx: 360,
      displaysPx: 360,
      deltaPx: -80,
      primary: 'displays',
    });
    assert.equal(r.displaysPx, 280);
    assert.equal(r.leftPx, 440);
    assertFill(frame, r);
  });

  it('context grow shrinks Displays; middle lock preserved', () => {
    const frame = 1440;
    const r = resolveStationDualRailDelta({
      frameWidthPx: frame,
      leftPx: 360,
      displaysPx: 360,
      deltaPx: 50,
      primary: 'context',
    });
    assert.equal(r.leftPx, 410);
    assert.equal(r.displaysPx, 310);
    assertFill(frame, r);
  });

  it('context shrink widens Displays; middle lock preserved', () => {
    const frame = 1440;
    const r = resolveStationDualRailDelta({
      frameWidthPx: frame,
      leftPx: 360,
      displaysPx: 360,
      deltaPx: -40,
      primary: 'context',
    });
    assert.equal(r.leftPx, 320);
    assert.equal(r.displaysPx, 400);
    assertFill(frame, r);
  });

  it('stops at left min (300) and pins Displays to fill', () => {
    const frame = 1440;
    const r = resolveStationDualRailDelta({
      frameWidthPx: frame,
      leftPx: 320,
      displaysPx: 400,
      deltaPx: 100,
      primary: 'displays',
    });
    assert.equal(r.leftPx, LEFT_MIN);
    assert.equal(r.displaysPx, frame - MIDDLE - LEFT_MIN);
    assertFill(frame, r);
  });

  it('stops at Displays min (280) and pins context to fill', () => {
    const frame = 1440;
    const r = resolveStationDualRailDelta({
      frameWidthPx: frame,
      leftPx: 360,
      displaysPx: 300,
      deltaPx: 100,
      primary: 'context',
    });
    assert.equal(r.displaysPx, DISPLAYS_MIN);
    assert.equal(r.leftPx, frame - MIDDLE - DISPLAYS_MIN);
    assertFill(frame, r);
  });

  it('zero delta re-pins to the fill equation', () => {
    const frame = 1440;
    const r = resolveStationDualRailDelta({
      frameWidthPx: frame,
      leftPx: 360,
      displaysPx: 420,
      deltaPx: 0,
      primary: 'displays',
    });
    assert.equal(r.leftPx, 360);
    assert.equal(r.displaysPx, frame - MIDDLE - 360);
    assertFill(frame, r);
  });

  it('1920: large Displays grow still inverse-trades against context', () => {
    const frame = 1920;
    const r = resolveStationDualRailDelta({
      frameWidthPx: frame,
      leftPx: 560,
      displaysPx: 640,
      deltaPx: 200,
      primary: 'displays',
    });
    assert.equal(r.displaysPx, 840);
    assert.equal(r.leftPx, 360);
    assertFill(frame, r);
  });
});
