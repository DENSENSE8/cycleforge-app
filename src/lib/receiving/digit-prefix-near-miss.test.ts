import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDigitPrefixNearMiss,
  trackingDigits,
} from './digit-prefix-near-miss';

test('trackingDigits strips non-digits', () => {
  assert.equal(trackingDigits('LX088692799IL'), '088692799');
  assert.equal(trackingDigits('LX08869279IL'), '08869279');
});

test('isDigitPrefixNearMiss: truncated Zoho Reference# vs full label', () => {
  const full = trackingDigits('LX088692799IL');
  const trunc = trackingDigits('LX08869279IL');
  assert.equal(isDigitPrefixNearMiss(full, trunc), true);
  assert.equal(isDigitPrefixNearMiss(trunc, full), true);
});

test('isDigitPrefixNearMiss: refuses exact match and large delta', () => {
  assert.equal(isDigitPrefixNearMiss('088692799', '088692799'), false);
  assert.equal(isDigitPrefixNearMiss('12345678', '12345678999'), false); // delta 3
  assert.equal(isDigitPrefixNearMiss('12345678', '99999999'), false); // not prefix
  assert.equal(isDigitPrefixNearMiss('', '088692799'), false);
});
