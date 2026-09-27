import test from 'node:test';
import assert from 'node:assert/strict';
import { GO_IDLE, GO_SCAN_BURST_MS, GO_TIMEOUT_MS, goReduce, type GoKeyInput, type GoState } from './go-keys';

const known = (letter: string) => letter === 's' || letter === 'f';

function press(state: GoState, key: string, at: number, over: Partial<GoKeyInput> = {}) {
  return goReduce(
    state,
    { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, editable: false, at, previousAt: at - 200, ...over },
    known,
  );
}

test('G then a known letter goes there, consuming both keys', () => {
  const armed = press(GO_IDLE, 'g', 1000);
  assert.deepEqual([armed.action, armed.consumed], [{ type: 'arm' }, true]);
  const go = press(armed.state, 's', 1300);
  assert.deepEqual([go.action, go.consumed, go.state], [{ type: 'go', letter: 's' }, true, GO_IDLE]);
});

test('an unknown letter disarms and passes through; Escape disarms and is consumed', () => {
  const armed = press(GO_IDLE, 'g', 1000).state;
  const unknown = press(armed, 'x', 1100);
  assert.deepEqual([unknown.action, unknown.consumed, unknown.state], [{ type: 'cancel' }, false, GO_IDLE]);
  const esc = press(armed, 'Escape', 1100);
  assert.deepEqual([esc.action, esc.consumed], [{ type: 'cancel' }, true]);
});

test('the letter must come within the timeout; after it, the key is ordinary again', () => {
  const armed = press(GO_IDLE, 'g', 1000).state;
  const late = press(armed, 's', 1000 + GO_TIMEOUT_MS + 1);
  assert.deepEqual([late.action, late.consumed], [{ type: 'none' }, false]);
  // A late `g` re-arms rather than being swallowed as a letter.
  assert.deepEqual(press(armed, 'g', 1000 + GO_TIMEOUT_MS + 1).action, { type: 'arm' });
});

test('never arms while typing, with a modifier, on Shift+G, on repeat, or from a scanner burst', () => {
  assert.equal(press(GO_IDLE, 'g', 1000, { editable: true }).consumed, false);
  assert.equal(press(GO_IDLE, 'g', 1000, { metaKey: true }).consumed, false);
  assert.equal(press(GO_IDLE, 'g', 1000, { ctrlKey: true }).consumed, false);
  assert.equal(press(GO_IDLE, 'G', 1000, { shiftKey: true }).consumed, false);
  assert.equal(press(GO_IDLE, 'g', 1000, { repeat: true }).consumed, false);
  assert.equal(press(GO_IDLE, 'g', 1000, { previousAt: 1000 - GO_SCAN_BURST_MS + 5 }).consumed, false);
});

test('focus moving into a field or a modifier chord while armed disarms without swallowing the key', () => {
  const armed = press(GO_IDLE, 'g', 1000).state;
  const typing = press(armed, 's', 1100, { editable: true });
  assert.deepEqual([typing.action, typing.consumed], [{ type: 'cancel' }, false]);
  const chord = press(armed, 's', 1100, { metaKey: true });
  assert.deepEqual([chord.action, chord.consumed], [{ type: 'cancel' }, false]);
});
