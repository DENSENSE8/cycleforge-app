import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CURSOR_LABEL_MAX_CHARS,
  canRideCursor,
  clearCursorLabel,
  isCursorLabelHostLive,
  publishCursorLabel,
  readCursorLabel,
  setCursorLabelHost,
} from './cursor-label';

// LANE ADAPTATION (2026-09-15):

test('only a short single-line string may ride the cursor', () => {
  assert.equal(canRideCursor('Copy tracking'), true);
  assert.equal(canRideCursor(''), false);
  assert.equal(canRideCursor('a\nb'), false, 'multi-line stays on the bubble');
  assert.equal(canRideCursor('x'.repeat(CURSOR_LABEL_MAX_CHARS + 1)), false);
  assert.equal(canRideCursor(null), false);
  assert.equal(canRideCursor({ type: 'span' }), false, 'rich labels stay on the bubble');
});

test('nothing is published while no layer is live — the bubble is the fallback', () => {
  assert.equal(isCursorLabelHostLive(), false);
  publishCursorLabel('a', 'rides nowhere');
  assert.equal(readCursorLabel(), null);
});

test('a leave clears only the label it owns; the host going dark clears all', () => {
  setCursorLabelHost(true);
  publishCursorLabel('a', 'A');
  clearCursorLabel('b');
  assert.equal(readCursorLabel()?.text, 'A', "b's leave cannot wipe a's label");
  setCursorLabelHost(false);
  assert.equal(readCursorLabel(), null, 'host dark clears every label');
});

// NOT PORTED to this lane (resume at mainline merge):
