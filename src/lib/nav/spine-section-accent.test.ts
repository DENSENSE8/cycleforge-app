import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appCanvasClass, appChromeClass } from '@/design-system/tokens/app-surface';
import {
  SPINE_CHILD_RAIL_INSET_CLASS,
  SPINE_CHILD_RAIL_TRUNK_CLASS,
} from '@/components/sidebar/sidebar-spine';
import { SPINE_ACCENT, spineRailLineClass } from './spine-section-accent';

describe('spine selected fill vs chrome', () => {
  it('current-page fill differs from MasterNav chrome so leaf L1 rows are visible', () => {
    // SidebarShell paints `appChromeClass` (`bg-surface-card`). A selected
    // row that reused that token was identical to idle on Packing / Scan out
    // (leaves have no nesting rail). Canvas is the chrome/canvas plane step
    // the rest of the frame already uses.
    assert.ok(SPINE_ACCENT.activePage.includes(appCanvasClass));
    assert.ok(!SPINE_ACCENT.activePage.includes(appChromeClass));
    assert.ok(SPINE_ACCENT.childActive.includes(appCanvasClass));
    assert.ok(!SPINE_ACCENT.idlePage.includes(appCanvasClass));
  });

  it('owns-active parent wash is lighter than current-page and not chrome', () => {
    assert.ok(SPINE_ACCENT.ownsActive.includes('bg-surface-hover'));
    assert.ok(!SPINE_ACCENT.ownsActive.includes(appCanvasClass));
    assert.ok(!SPINE_ACCENT.ownsActive.includes(appChromeClass));
    assert.notEqual(SPINE_ACCENT.ownsActive, SPINE_ACCENT.activePage);
  });
});

/**
 * The child rail's PAINT, not just its existence.
 *
 * jsdom has no layout engine, so the defect these guard against — a 2px flex
 * item crushed to `width: 0` — is invisible to a mounted test. It was found by
 * measuring `getBoundingClientRect()` in a real Chromium against the app's
 * compiled CSS (2026-09-15): `left 15, right 15, width 0`. The rail had been
 * mounted, positioned and coloured correctly, and painting nothing, since N6f.
 * Class-level assertions are therefore the only mechanism available here.
 */
describe('the child rail actually paints', () => {
  it('the rail cannot be shrunk away by the row it sits beside', () => {
    // The row shell is `flex w-full` and SPINE_ROW_FACE_CLASS pins the BUTTON
    // `shrink-0`, so the 2px rail was the only yielding item in the line and
    // flexbox took the whole overflow out of it. Dropping `shrink-0` here
    // silently deletes the mark on both surfaces.
    for (const active of [true, false]) {
      assert.match(spineRailLineClass(active), /\bshrink-0\b/);
      assert.match(spineRailLineClass(active), /\bw-0\.5\b/);
    }
  });

  it('idle is the structural guide, active is the state marker', () => {
    assert.match(spineRailLineClass(false), /bg-border-soft/);
    assert.match(spineRailLineClass(true), /bg-text-default/);
    assert.notEqual(spineRailLineClass(true), spineRailLineClass(false));
  });

  it('the continuous trunk runs from above the body to its bottom', () => {
    // `-top-3` is the 12px of air between a 16px glyph and the bottom of its
    // 40px row — it is what makes the line start ON the parent icon instead of
    // 12px below it (operator 2026-09-15: "from the bottom of the icon ... down
    // to the bottom of the child list").
    assert.match(SPINE_CHILD_RAIL_TRUNK_CLASS, /\babsolute\b/);
    assert.match(SPINE_CHILD_RAIL_TRUNK_CLASS, /-top-3\b/);
    assert.match(SPINE_CHILD_RAIL_TRUNK_CLASS, /\bbottom-0\b/);
    assert.match(SPINE_CHILD_RAIL_TRUNK_CLASS, /\bw-0\.5\b/);
  });

  it('trunk and per-row segments share ONE column', () => {
    // The invariant that keeps them one line instead of two: the body's left
    // pad and the trunk's left offset are the same derived number. Change one
    // and the guide splits from the marker.
    const inset = /\[(\d+)px\]/.exec(SPINE_CHILD_RAIL_INSET_CLASS)?.[1];
    const trunk = /left-\[(\d+)px\]/.exec(SPINE_CHILD_RAIL_TRUNK_CLASS)?.[1];
    assert.ok(inset, 'the body inset must state its px');
    assert.equal(trunk, inset);
  });
});
