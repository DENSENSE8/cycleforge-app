import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPriceKey,
  isPriceKeypadKey,
  PRICE_KEYPAD_KEYS,
  priceKeyFromKeyboard,
} from './price-keypad';

const DEC = { decimals: 2 };

describe('applyPriceKey', () => {
  it('replaces the seeded figure on the first press', () => {
    assert.equal(applyPriceKey('60.00', '1', { ...DEC, replace: true }), '1');
    assert.equal(applyPriceKey('60.00', '.', { ...DEC, replace: true }), '0.');
  });

  it('appends digits and allows one decimal', () => {
    assert.equal(applyPriceKey('1', '2', DEC), '12');
    assert.equal(applyPriceKey('12', '.', DEC), '12.');
    assert.equal(applyPriceKey('12.', '5', DEC), '12.5');
    assert.equal(applyPriceKey('12.5', '0', DEC), '12.50');
  });

  it('rejects a second decimal and extra fractional digits', () => {
    assert.equal(applyPriceKey('12.50', '.', DEC), '12.50');
    assert.equal(applyPriceKey('12.50', '9', DEC), '12.50');
  });

  it('backs up one character and replaces a lone zero', () => {
    assert.equal(applyPriceKey('12.5', 'back', DEC), '12.');
    assert.equal(applyPriceKey('0', '4', DEC), '4');
    assert.equal(applyPriceKey('', 'back', DEC), '');
  });
});

describe('priceKeyFromKeyboard', () => {
  it('maps digits, decimal, comma, and backspace', () => {
    assert.equal(priceKeyFromKeyboard('7'), '7');
    assert.equal(priceKeyFromKeyboard('.'), '.');
    assert.equal(priceKeyFromKeyboard(','), '.');
    assert.equal(priceKeyFromKeyboard('Backspace'), 'back');
    assert.equal(priceKeyFromKeyboard('Enter'), null);
  });
});

describe('PRICE_KEYPAD_KEYS', () => {
  it('is a 3×4 square pad', () => {
    assert.equal(PRICE_KEYPAD_KEYS.length, 12);
    assert.equal(isPriceKeypadKey('back'), true);
    assert.equal(isPriceKeypadKey('x'), false);
  });
});
