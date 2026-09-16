/**
 * Unit tests for copy-chip-format helpers.
 *
 *   npx tsx --test src/lib/copy-chip-format.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHIP_DISPLAY_LEN,
  EMPTY_CHIP_DISPLAY,
  QUIET_CHIP_EMPTY,
  abbreviateIdentifier,
  disambiguateSerialDisplays,
  getLast8,
  getLast8Serial,
  resolveChipDisplay,
  resolveSerialDisplay,
} from './copy-chip-format';

test('getLast8: undelimited ids fall back to the trailing 8', () => {
  assert.equal(getLast8('9434608101234567890123'), '67890123');
  assert.equal(getLast8('12345678'), '12345678');
  assert.equal(getLast8('abc'), 'abc');
  assert.equal(getLast8(''), '---');
});

test('abbreviateIdentifier: cuts on the last delimiter, never at a blind offset', () => {
  // Amazon. `raw.slice(-8)` gave `-0292212` — a dash that reads as a minus.
  assert.equal(abbreviateIdentifier('113-1397006-0292212'), '0292212');
  // eBay-style two-part id: the varying half is the whole identity.
  assert.equal(abbreviateIdentifier('38-50690'), '50690');
  // No delimiter anywhere (USPS tracking) — the 8-char window, with no symbol.
  assert.equal(abbreviateIdentifier('9405508106244533289572'), '33289572');
  // Underscore / slash / dot / colon are identifier delimiters too.
  assert.equal(abbreviateIdentifier('RMA_2026_884213'), '884213');
  assert.equal(abbreviateIdentifier('ORD/2026/0041'), '0041');
});

test('abbreviateIdentifier: never pads — a padded id is a wrong id', () => {
  // Staff read these aloud and key them into an RF scanner.
  assert.equal(abbreviateIdentifier('5034'), '5034');
  assert.equal(abbreviateIdentifier('7'), '7');
  assert.equal(getLast8('5034'), '5034');
});

test('abbreviateIdentifier: a trailing segment under 4 chars is not an identity', () => {
  // `…-2` is a line suffix; the 8-char window says more than the check digit.
  assert.equal(abbreviateIdentifier('4400123456-2'), '123456-2');
  assert.equal(abbreviateIdentifier('PROD:qty'), 'PROD:qty');
});

test('abbreviateIdentifier: output never begins with a non-alphanumeric', () => {
  const ids = [
    '113-1397006-0292212',
    '38-50690',
    '9405508106244533289572',
    '5034',
    '4400123456-2',
    'SKU--0106',
    '#4989',
    'ORD/2026/0041',
    'X.9912',
    'AMZ_-_771',
    '1Z999AA10123456784',
  ];
  for (const id of ids) {
    const out = abbreviateIdentifier(id);
    assert.ok(out.length > 0, `${id}: abbreviated to nothing`);
    assert.match(out, /^[0-9a-z]/i, `${id} -> ${out}: leading non-alphanumeric`);
  }
});

test('resolveChipDisplay / resolveSerialDisplay empty face is quiet em dash (2B)', () => {
  assert.equal(EMPTY_CHIP_DISPLAY.length, CHIP_DISPLAY_LEN);
  assert.equal(QUIET_CHIP_EMPTY, '—');
  assert.equal(resolveChipDisplay(''), QUIET_CHIP_EMPTY);
  assert.equal(resolveChipDisplay('----'), QUIET_CHIP_EMPTY); // legacy 4-dash
  assert.equal(resolveChipDisplay(EMPTY_CHIP_DISPLAY), QUIET_CHIP_EMPTY);
  assert.equal(resolveSerialDisplay(''), QUIET_CHIP_EMPTY);
  assert.equal(resolveSerialDisplay('SERIAL'), QUIET_CHIP_EMPTY);
});

test('disambiguateSerialDisplays: unique last-8 stay at 8', () => {
  assert.deepEqual(disambiguateSerialDisplays(['AAA11111111', 'BBB22222222']), [
    '11111111',
    '22222222',
  ]);
});

test('disambiguateSerialDisplays: colliding last-8 grow until unique', () => {
  // Share the same trailing 8; differ earlier.
  const a = 'XX0590882AE';
  const b = 'YY0590882AE';
  assert.equal(getLast8Serial(a), getLast8Serial(b));
  const displays = disambiguateSerialDisplays([a, b]);
  assert.equal(displays.length, 2);
  assert.equal(new Set(displays).size, 2);
  assert.ok(displays.every((d) => d.length > CHIP_DISPLAY_LEN));
  assert.ok(a.endsWith(displays[0]!));
  assert.ok(b.endsWith(displays[1]!));
});

test('disambiguateSerialDisplays: empty / sentinel', () => {
  assert.deepEqual(disambiguateSerialDisplays([]), []);
  assert.deepEqual(disambiguateSerialDisplays(['']), [resolveSerialDisplay('')]);
});
