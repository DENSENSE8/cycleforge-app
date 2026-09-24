import assert from 'node:assert/strict';
import test from 'node:test';
import { repairIdFromScan } from './scan-mode';

test('repair-service labels resolve only from the canonical RS-ID handle', () => {
  assert.equal(repairIdFromScan('RS-123'), 123);
  assert.equal(repairIdFromScan(' rs-42 '), 42);
  assert.equal(repairIdFromScan('R-123'), null);
  assert.equal(repairIdFromScan('RS-0'), null);
  assert.equal(repairIdFromScan('RS-12A'), null);
});
