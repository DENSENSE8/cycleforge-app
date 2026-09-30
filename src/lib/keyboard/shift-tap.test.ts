import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIFT_TAP_IDLE, SHIFT_TAP_MAX_MS, shiftTapReduce, type ShiftTapInput, type ShiftTapState } from './shift-tap';

const down = (key: string, at: number, extra: Partial<{ repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}): ShiftTapInput => ({
  type: 'keydown',
  key,
  at,
  repeat: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...extra,
});
const up = (key: string, at: number): ShiftTapInput => ({ type: 'keyup', key, at });

function run(inputs: readonly ShiftTapInput[]): boolean[] {
  let state: ShiftTapState = SHIFT_TAP_IDLE;
  return inputs.map((input) => {
    const next = shiftTapReduce(state, input);
    state = next.state;
    return next.tapped;
  });
}

test('Shift down then up, alone and quick, is a tap', () => {
  assert.deepEqual(run([down('Shift', 0), up('Shift', 120)]), [false, true]);
  assert.deepEqual(run([down('Shift', 0), up('Shift', SHIFT_TAP_MAX_MS)]), [false, true]);
});

test('anything in between makes it a chord, a hold, or a selection — never a tap', () => {
  // Shift+? (help), Shift+X, ⌘⇧S: another key went down.
  assert.deepEqual(run([down('Shift', 0), down('?', 50), up('?', 80), up('Shift', 100)]), [false, false, false, false]);
  // Held past the window (the saved-view digit reveal), key repeat included.
  assert.deepEqual(run([down('Shift', 0), down('Shift', 300, { repeat: true }), up('Shift', SHIFT_TAP_MAX_MS + 1)]), [false, false, false]);
  // Shift+click extends a text selection.
  assert.deepEqual(run([down('Shift', 0), { type: 'pointerdown' }, up('Shift', 100)]), [false, false, false]);
  // ⌘ already down.
  assert.deepEqual(run([down('Shift', 0, { metaKey: true }), up('Shift', 100)]), [false, false]);
  // Focus left the window mid-press.
  assert.deepEqual(run([down('Shift', 0), { type: 'blur' }, up('Shift', 100)]), [false, false, false]);
});

test('a second tap is its own tap (it folds the views again)', () => {
  assert.deepEqual(run([down('Shift', 0), up('Shift', 100), down('Shift', 400), up('Shift', 500)]), [false, true, false, true]);
});
