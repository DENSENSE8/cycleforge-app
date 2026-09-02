import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLocationScan } from './useMoveLocation';

test('resolves a scanned location by exact barcode before any display label', () => {
  const result = resolveLocationScan('LOC-R-51851', [
    { id: 1, name: 'Returns shelf', room: 'A', barcode: 'R-51851' },
    { id: 2, name: 'Overflow shelf', room: 'B', barcode: 'LOC-R-51851' },
  ]);

  assert.deepEqual(result, { id: 2, name: 'Overflow shelf', room: 'B', barcode: 'LOC-R-51851' });
});

test('does not resolve a partial or human-label match as a location scan', () => {
  const locations = [{ id: 1, name: 'Returns shelf', room: 'A', barcode: 'R-51851' }];

  assert.equal(resolveLocationScan('51851', locations), null);
  assert.equal(resolveLocationScan('Returns shelf', locations), null);
});
