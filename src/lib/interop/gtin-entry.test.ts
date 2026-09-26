/** classifyGtinEntry — the gate for a GTIN a person typed. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyGtinEntry, gs1CheckDigit } from './gs1-keys';

/** A licensed GTIN-14 on prefix `0812345`, check digit and all. */
const LICENSED_14 = '00812345000016';
/** The same licensed prefix at packaging INDICATOR 2 — starts "20", still real. */
const LICENSED_14_INDICATOR_2 = '20812345000010';
/** What generateInternalGtin stamps for sku_catalog id 10. */
const MINTED_ID_10 = '02000000000107';

/** Build a check-digit-valid key on an arbitrary body. */
function withCheck(body: string): string {
  return body + String(gs1CheckDigit(body));
}

test('accepts a licensed GTIN and returns bare digits', () => {
  const v = classifyGtinEntry(LICENSED_14);
  assert.equal(v.ok, true, v.message ?? '');
  assert.equal(v.refusal, null);
  assert.equal(v.message, null);
  assert.equal(v.digits, LICENSED_14);
});

test('strips separators an operator types or a scanner injects', () => {
  const v = classifyGtinEntry(' 0081234-5000016 ');
  assert.equal(v.ok, true, v.message ?? '');
  assert.equal(v.digits, LICENSED_14, 'the stored value is digits only');
});

test('empty is a refusal, not a crash — clearing is the caller’s job', () => {
  for (const raw of [null, undefined, '', '   ', '--']) {
    const v = classifyGtinEntry(raw);
    assert.equal(v.ok, false);
    assert.equal(v.refusal, 'empty', `expected empty refusal for ${JSON.stringify(raw)}`);
  }
});

test('refuses a wrong length before it can blame the check digit', () => {
  // 11 digits: no GTIN length, so its trailing digit is not a check digit at all.
  const v = classifyGtinEntry('08123450000');
  assert.equal(v.refusal, 'length');
  assert.match(v.message ?? '', /11/, 'the message names the length it got');
});

test('refuses a transposed digit via the check digit', () => {
  const bad = LICENSED_14.slice(0, 12) + (LICENSED_14[12] === '9' ? '8' : '9') + LICENSED_14[13];
  assert.notEqual(bad, LICENSED_14);
  assert.equal(classifyGtinEntry(bad).refusal, 'check-digit');
});

test('refuses a GS1 documentation prefix — those digits name another company', () => {
  assert.equal(classifyGtinEntry(withCheck('061414100000')).refusal, 'placeholder');
});

test('refuses a documentation prefix hiding behind a GTIN-14 indicator digit', () => {
  assert.equal(classifyGtinEntry(withCheck('1061414100000')).refusal, 'placeholder');
});

test('refuses this app’s own minted internal number, and says how to get it back', () => {
  const v = classifyGtinEntry(MINTED_ID_10);
  assert.equal(v.refusal, 'restricted-circulation');
  assert.match(v.message ?? '', /clear the field/i);
});

test('a legitimate case-pack GTIN-14 on indicator 2 is NOT restricted circulation', () => {
  // Indicator 2 over the licensed prefix 0812345 starts with "20", so a raw
  // prefix test would refuse a real trade item. The GTIN-13 normalisation
  // inside isRestrictedCirculationGtin is what keeps this accepted.
  const v = classifyGtinEntry(LICENSED_14_INDICATOR_2);
  assert.equal(v.ok, true, v.message ?? '');
});
