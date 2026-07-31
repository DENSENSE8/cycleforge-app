/**
 * Unit tests for copy-chip-format helpers.
 *
 *   npx tsx --test src/lib/copy-chip-format.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  disambiguateSerialDisplays,
  getLast4Serial,
  resolveSerialDisplay,
} from './copy-chip-format';

test('disambiguateSerialDisplays: unique last-4 stay at 4', () => {
  assert.deepEqual(disambiguateSerialDisplays(['AAA1111', 'BBB2222']), ['1111', '2222']);
});

test('disambiguateSerialDisplays: colliding last-4 grow until unique', () => {
  const a = '070315F60590882AE';
  const b = '070214960600582AE';
  assert.equal(getLast4Serial(a), getLast4Serial(b));
  const displays = disambiguateSerialDisplays([a, b]);
  assert.equal(displays.length, 2);
  assert.equal(new Set(displays).size, 2);
  assert.ok(displays.every((d) => d.length > 4));
  assert.ok(a.endsWith(displays[0]!));
  assert.ok(b.endsWith(displays[1]!));
});

test('disambiguateSerialDisplays: empty / sentinel', () => {
  assert.deepEqual(disambiguateSerialDisplays([]), []);
  assert.deepEqual(disambiguateSerialDisplays(['']), [resolveSerialDisplay('')]);
});
