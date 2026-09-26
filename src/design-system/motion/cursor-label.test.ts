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

// LANE ADAPTATION (2026-09-15): this tree ported the cursor-FOLLOW tooltip
// (`CursorLabelLayer`) WITHOUT the custom cursor (operator: "do not use the
// custom cursor, just use the follow tooltip"). Mainline's MorphCursorLayer,
// scrub, native-title lifting, chord keycaps and SiteTooltipProvider laws
// resume when the mainline merge brings those components; the channel laws
// below are untouched.

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

// NOT PORTED to this lane (resume at mainline merge): the hotkey-chord hint
// law (HotkeyTooltip + KeyboardChord + ComposerModeRow cursor kinds) and the
// native-title lifting law — both depend on MorphCursorLayer machinery this
// tree deliberately left behind with the custom cursor.
