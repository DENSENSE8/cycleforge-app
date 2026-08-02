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
  disambiguateSerialDisplays,
  getLast8,
  getLast8Serial,
  resolveChipDisplay,
  resolveSerialDisplay,
} from './copy-chip-format';

test('getLast8: truncates to trailing 8', () => {
  assert.equal(getLast8('9434608101234567890123'), '67890123');
  assert.equal(getLast8('12345678'), '12345678');
  assert.equal(getLast8('abc'), 'abc');
  assert.equal(getLast8(''), '---');
});

test('resolveChipDisplay / resolveSerialDisplay empty face is 8 dashes', () => {
  assert.equal(EMPTY_CHIP_DISPLAY.length, CHIP_DISPLAY_LEN);
  assert.equal(resolveChipDisplay(''), EMPTY_CHIP_DISPLAY);
  assert.equal(resolveChipDisplay('----'), EMPTY_CHIP_DISPLAY); // legacy 4-dash
  assert.equal(resolveSerialDisplay(''), EMPTY_CHIP_DISPLAY);
  assert.equal(resolveSerialDisplay('SERIAL'), EMPTY_CHIP_DISPLAY);
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
