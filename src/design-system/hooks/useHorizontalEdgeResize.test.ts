import assert from 'node:assert/strict';
import { test } from 'node:test';
import { widthFromEdgeDrag } from '@/design-system/hooks/useHorizontalEdgeResize';
import {
  CONTEXT_PANEL_RESIZE,
  CONTEXT_PANEL_WIDTH_PX,
} from '@/components/sidebar/context-panel-column';

test('widthFromEdgeDrag: leading edge — drag left grows (right-anchored pane)', () => {
  assert.equal(widthFromEdgeDrag(420, 100, 80, 'leading'), 440);
  assert.equal(widthFromEdgeDrag(420, 100, 130, 'leading'), 390);
});

test('widthFromEdgeDrag: trailing edge — drag right grows (left-anchored pane)', () => {
  assert.equal(widthFromEdgeDrag(360, 100, 140, 'trailing'), 400);
  assert.equal(widthFromEdgeDrag(360, 100, 60, 'trailing'), 320);
});

test('CONTEXT_PANEL_RESIZE defaults match the fixed column width token', () => {
  assert.equal(CONTEXT_PANEL_RESIZE.defaultWidthPx, CONTEXT_PANEL_WIDTH_PX);
  assert.ok(CONTEXT_PANEL_RESIZE.minWidthPx < CONTEXT_PANEL_WIDTH_PX);
  assert.ok(CONTEXT_PANEL_RESIZE.maxWidthPadPx > CONTEXT_PANEL_WIDTH_PX);
});
