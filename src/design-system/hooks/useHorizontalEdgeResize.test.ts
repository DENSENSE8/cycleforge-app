import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EDGE_RESIZE_COLLAPSE_SLACK_PX,
  edgeDragArmState,
  edgeResizeWidthCap,
  shouldCollapseFromEdgeDrag,
  widthFromEdgeDrag,
} from '@/design-system/hooks/useHorizontalEdgeResize';
import {
  CONTEXT_PANEL_RESIZE,
  CONTEXT_PANEL_WIDTH_PX,
} from '@/components/sidebar/context-panel-column';
import {
  DETAIL_STACK_LAYOUT,
  DETAIL_STACK_RESIZE,
} from '@/design-system/shells/detail-stack';

test('widthFromEdgeDrag: leading edge — drag left grows (right-anchored pane)', () => {
  assert.equal(widthFromEdgeDrag(420, 100, 80, 'leading'), 440);
  assert.equal(widthFromEdgeDrag(420, 100, 130, 'leading'), 390);
});

test('widthFromEdgeDrag: trailing edge — drag right grows (left-anchored pane)', () => {
  assert.equal(widthFromEdgeDrag(360, 100, 140, 'trailing'), 400);
  assert.equal(widthFromEdgeDrag(360, 100, 60, 'trailing'), 320);
});

test('shouldCollapseFromEdgeDrag: requires a finite threshold below raw width', () => {
  const threshold = CONTEXT_PANEL_RESIZE.minWidthPx - EDGE_RESIZE_COLLAPSE_SLACK_PX;
  assert.equal(shouldCollapseFromEdgeDrag(threshold - 1, threshold), true);
  assert.equal(shouldCollapseFromEdgeDrag(threshold, threshold), false);
  assert.equal(shouldCollapseFromEdgeDrag(CONTEXT_PANEL_RESIZE.minWidthPx, threshold), false);
  assert.equal(shouldCollapseFromEdgeDrag(200, undefined), false);
  assert.equal(shouldCollapseFromEdgeDrag(200, Number.NaN), false);
  assert.equal(shouldCollapseFromEdgeDrag(Number.NaN, threshold), false);
});

test('edgeDragArmState: overshoot — pinned at cap, leaning into the close slack', () => {
  const cap = 540; // clamped live width when the pane is pinned at its max
  const beyond = cap + EDGE_RESIZE_COLLAPSE_SLACK_PX; // 588 — close fires past this
  // Resting exactly at cap is not leaning — no arm.
  assert.equal(
    edgeDragArmState({ rawWidth: cap, clampedWidth: cap, overshootBeyondPx: beyond }),
    'none',
  );
  // Pushing past cap but within the slack — armed.
  assert.equal(
    edgeDragArmState({ rawWidth: cap + 10, clampedWidth: cap, overshootBeyondPx: beyond }),
    'overshoot',
  );
  assert.equal(
    edgeDragArmState({ rawWidth: beyond, clampedWidth: cap, overshootBeyondPx: beyond }),
    'overshoot',
  );
  // Past the slack — the close fires, so the arm clears (no longer "about to").
  assert.equal(
    edgeDragArmState({ rawWidth: beyond + 1, clampedWidth: cap, overshootBeyondPx: beyond }),
    'none',
  );
  // No close wired to arm → never armed even while leaning.
  assert.equal(
    edgeDragArmState({ rawWidth: cap + 10, clampedWidth: cap }),
    'none',
  );
});

test('edgeDragArmState: collapse — pinned at min, leaning into the park slack', () => {
  const min = 300;
  const below = min - EDGE_RESIZE_COLLAPSE_SLACK_PX; // 252 — park fires below this
  assert.equal(
    edgeDragArmState({ rawWidth: min, clampedWidth: min, collapseBelowPx: below }),
    'none',
  );
  assert.equal(
    edgeDragArmState({ rawWidth: min - 10, clampedWidth: min, collapseBelowPx: below }),
    'collapse',
  );
  assert.equal(
    edgeDragArmState({ rawWidth: below, clampedWidth: min, collapseBelowPx: below }),
    'collapse',
  );
  assert.equal(
    edgeDragArmState({ rawWidth: below - 1, clampedWidth: min, collapseBelowPx: below }),
    'none',
  );
});

test('edgeDragArmState: non-finite inputs never arm', () => {
  assert.equal(
    edgeDragArmState({ rawWidth: Number.NaN, clampedWidth: 400, overshootBeyondPx: 500 }),
    'none',
  );
  assert.equal(
    edgeDragArmState({ rawWidth: 600, clampedWidth: Number.NaN, overshootBeyondPx: 500 }),
    'none',
  );
});

test('EDGE_RESIZE_COLLAPSE_SLACK_PX keeps context-rail threshold intentional', () => {
  assert.equal(EDGE_RESIZE_COLLAPSE_SLACK_PX, 48);
  assert.ok(
    CONTEXT_PANEL_RESIZE.minWidthPx - EDGE_RESIZE_COLLAPSE_SLACK_PX > 0,
    'collapse threshold must stay positive',
  );
});

test('CONTEXT_PANEL_RESIZE defaults match the fixed column width token', () => {
  assert.equal(CONTEXT_PANEL_RESIZE.defaultWidthPx, CONTEXT_PANEL_WIDTH_PX);
  assert.ok(CONTEXT_PANEL_RESIZE.minWidthPx < CONTEXT_PANEL_WIDTH_PX);
  assert.ok(CONTEXT_PANEL_RESIZE.maxWidthPadPx > CONTEXT_PANEL_WIDTH_PX);
});

test('DETAIL_STACK_RESIZE defaults track DETAIL_STACK_LAYOUT', () => {
  assert.equal(DETAIL_STACK_RESIZE.defaultWidthPx, DETAIL_STACK_LAYOUT.widthPx);
  assert.ok(DETAIL_STACK_RESIZE.minWidthPx < DETAIL_STACK_LAYOUT.widthPx);
  assert.ok(DETAIL_STACK_LAYOUT.insetPx > 0);
});

test('edgeResizeWidthCap: absolute maxWidth wins over a loose viewport pad', () => {
  // 1920 − 420 = 1500 viewport room, but Ticket caps at 480.
  assert.equal(edgeResizeWidthCap(360, 420, 480, 1920), 480);
});

test('edgeResizeWidthCap: viewport pad wins when tighter than maxWidth', () => {
  // 900 − 420 = 480; with maxWidth 560 the pad still caps at 480.
  assert.equal(edgeResizeWidthCap(360, 420, 560, 900), 480);
});

test('edgeResizeWidthCap: omitting maxWidth keeps pad-only behavior', () => {
  assert.equal(edgeResizeWidthCap(360, 420, undefined, 1920), 1500);
});
