import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EDGE_RESIZE_COLLAPSE_SLACK_PX,
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
