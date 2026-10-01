import assert from 'node:assert/strict';
import test from 'node:test';
import { LocationsPatchBody } from './locations';

const proof = 'proof-token-long-enough-for-the-wire-contract';

test('physical location movement requires scan proof and a reason', () => {
  assert.equal(LocationsPatchBody.safeParse({ action: 'take', sku: 'SKU-1', qty: 1 }).success, false);
  assert.equal(LocationsPatchBody.safeParse({
    action: 'take', sku: 'SKU-1', qty: 1, reason: 'TAKE_ORDER', locationVerificationToken: proof,
  }).success, true);
  assert.equal(LocationsPatchBody.safeParse({
    action: 'put', sku: 'SKU-1', qty: 1, locationVerificationToken: proof,
  }).success, true);
});
