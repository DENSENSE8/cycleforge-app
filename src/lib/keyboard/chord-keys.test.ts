import test from 'node:test';
import assert from 'node:assert/strict';
import { altDigitChord, altDigitSlot, chordKeys } from './chord-keys';

const key = (code: string, mods: Partial<Record<'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey', boolean>> = {}) => ({
  code,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods,
});

test('⌥1…⌥9 open slots 0…8 and ⌥0 opens the tenth; any other modifier is a different chord', () => {
  assert.equal(altDigitSlot(key('Digit1', { altKey: true })), 0);
  assert.equal(altDigitSlot(key('Digit9', { altKey: true })), 8);
  assert.equal(altDigitSlot(key('Digit0', { altKey: true })), 9);
  assert.equal(altDigitSlot(key('Digit1')), null);
  assert.equal(altDigitSlot(key('Digit1', { altKey: true, metaKey: true })), null);
  assert.equal(altDigitSlot(key('Digit1', { altKey: true, ctrlKey: true })), null);
  assert.equal(altDigitSlot(key('Digit1', { altKey: true, shiftKey: true })), null);
  assert.equal(altDigitSlot(key('Numpad1', { altKey: true })), null);
  for (let slot = 0; slot < 10; slot += 1) {
    const digit = altDigitChord(slot).slice(-1);
    assert.equal(altDigitSlot(key(`Digit${digit}`, { altKey: true })), slot);
  }
});

test('chord faces follow the platform: ⌘ ⇧ ⌥ on Apple, words elsewhere', () => {
  assert.deepEqual(chordKeys('mod+shift+o', true), ['⌘', '⇧', 'O']);
  assert.deepEqual(chordKeys('mod+shift+o', false), ['Ctrl', 'Shift', 'O']);
  assert.deepEqual(chordKeys('alt+0', true), ['⌥', '0']);
  assert.deepEqual(chordKeys('alt+0', false), ['Alt', '0']);
});
