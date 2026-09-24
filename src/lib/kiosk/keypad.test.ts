/**
 *   node --import tsx --test src/lib/kiosk/keypad.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KEYPAD_MAX_CENTS, pressKeypad, type KeypadPress } from './keypad';

const type = (keys: KeypadPress[], from = 0) => keys.reduce(pressKeypad, from);

describe('pressKeypad', () => {
  it('fills from the right: 1, 2, 5, 0 reads $12.50', () => {
    assert.equal(type(['1', '2', '5', '0']), 1250);
  });

  it('C clears the whole amount; keyboard back drops the last digit', () => {
    assert.equal(type(['1', '2', '5', 'C']), 0);
    assert.equal(type(['C', '7']), 7);
    assert.equal(type(['1', '2', '5', 'back']), 12);
  });

  it('ignores a key that would pass the cap instead of truncating the amount', () => {
    assert.equal(pressKeypad(KEYPAD_MAX_CENTS, '9'), KEYPAD_MAX_CENTS);
  });
});
