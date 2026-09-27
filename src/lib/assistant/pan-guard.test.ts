/**
 * PAN guard — card numbers are removed from chat text before anything else
 * sees it; order numbers, tracking numbers and phone numbers are not.
 * Run: npx tsx --test src/lib/assistant/pan-guard.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_NUMBER_PLACEHOLDER, luhnValid, redactCardNumbers, scanCardNumbers } from './pan-guard';

test('spaced, dashed and bare test cards are removed', () => {
  for (const pan of ['4111 1111 1111 1111', '4111-1111-1111-1111', '4111111111111111', '5555 5555 5555 4444', '3782 822463 10005', '6011111111111117']) {
    const out = scanCardNumbers(`charge ${pan} exp 12/29 please`);
    assert.equal(out.redacted, 1, pan);
    assert.equal(out.text, `charge ${CARD_NUMBER_PLACEHOLDER} exp 12/29 please`, pan);
    assert.ok(!/\d{4}/.test(out.text.replace('12/29', '')), `no digits left for ${pan}`);
  }
});

test('a card glued to a preceding number group is still found', () => {
  assert.equal(redactCardNumbers('PH 12 4111 1111 1111 1111'), `PH 12 ${CARD_NUMBER_PLACEHOLDER}`);
});

test('two cards in one message are both removed', () => {
  const out = scanCardNumbers('first 4111111111111111, then 5555555555554444.');
  assert.equal(out.redacted, 2);
  assert.equal(out.text, `first ${CARD_NUMBER_PLACEHOLDER}, then ${CARD_NUMBER_PLACEHOLDER}.`);
});

test('Luhn-invalid 16-digit runs and non-card prefixes stay', () => {
  assert.equal(luhnValid('4111111111111112'), false);
  for (const keep of [
    '4111 1111 1111 1112', // fails Luhn
    '9400111899223100001234', // 22-digit USPS tracking, unbroken
    '9400 1000 0000 0000 0000 00', // grouped tracking — prefix 9 is no card network
    'order 111-4392017-2231904', // Amazon order number (prefix 1)
    'call 555-867-5309', // phone
    'PH-000123',
  ]) {
    assert.equal(redactCardNumbers(keep), keep, keep);
  }
});

test('empty input is a no-op', () => {
  assert.deepEqual(scanCardNumbers(''), { text: '', redacted: 0 });
});
