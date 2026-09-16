import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHardwareScannerPayload } from './scanner-payload';

test('normalizes string and object scanner payloads', () => {
  assert.equal(parseHardwareScannerPayload('  BIN-42  '), 'BIN-42');
  assert.equal(parseHardwareScannerPayload({ value: ' SKU-7 ' }), 'SKU-7');
});

test('rejects empty and non-string scanner payloads', () => {
  assert.equal(parseHardwareScannerPayload('   '), null);
  assert.equal(parseHardwareScannerPayload({ value: 42 }), null);
});
