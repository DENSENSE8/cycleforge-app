/**
 * Unit tests for pin slot chords (order → ⌘/Ctrl+1–9).
 * Run: node --test --import tsx src/lib/quick-access/pin-hotkeys.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pinHotkeyLabel,
  pinSlotFromKeyboardEvent,
} from './pin-hotkeys';

function fakeKey(partial: Partial<KeyboardEvent> & { code: string }): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...partial,
  } as KeyboardEvent;
}

test('pinHotkeyLabel returns empty outside 1–9', () => {
  assert.equal(pinHotkeyLabel(0), '');
  assert.equal(pinHotkeyLabel(10), '');
  assert.equal(pinHotkeyLabel(1.5), '');
});

test('pinHotkeyLabel formats a slot for the current platform', () => {
  const label = pinHotkeyLabel(3);
  assert.match(label, /^(⌘|Ctrl\+)3$/);
});

test('pinSlotFromKeyboardEvent resolves Digit and Numpad with meta/ctrl', () => {
  assert.equal(
    pinSlotFromKeyboardEvent(fakeKey({ metaKey: true, code: 'Digit4' })),
    4,
  );
  assert.equal(
    pinSlotFromKeyboardEvent(fakeKey({ ctrlKey: true, code: 'Numpad9' })),
    9,
  );
});

test('pinSlotFromKeyboardEvent rejects shift, alt, and unbound keys', () => {
  assert.equal(
    pinSlotFromKeyboardEvent(fakeKey({ metaKey: true, shiftKey: true, code: 'Digit1' })),
    null,
  );
  assert.equal(
    pinSlotFromKeyboardEvent(fakeKey({ metaKey: true, altKey: true, code: 'Digit1' })),
    null,
  );
  assert.equal(
    pinSlotFromKeyboardEvent(fakeKey({ metaKey: true, code: 'Digit0' })),
    null,
  );
  assert.equal(
    pinSlotFromKeyboardEvent(fakeKey({ code: 'Digit1' })),
    null,
  );
});
