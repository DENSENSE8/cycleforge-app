import test from 'node:test';
import assert from 'node:assert/strict';
import { isZohoAbortError, zohoRequestTimeoutMs } from './http-timeouts';

test('isZohoAbortError: AbortError / TimeoutError / message sentinels', () => {
  assert.equal(isZohoAbortError(Object.assign(new Error('x'), { name: 'AbortError' })), true);
  assert.equal(isZohoAbortError(Object.assign(new Error('x'), { name: 'TimeoutError' })), true);
  assert.equal(isZohoAbortError(new Error('The operation was aborted due to timeout')), true);
  assert.equal(isZohoAbortError(new Error('request timed out')), true);
  assert.equal(isZohoAbortError(new Error('Zoho rate limit')), false);
  assert.equal(isZohoAbortError(null), false);
});

test('zohoRequestTimeoutMs: long window only for purchase-receive mutations', () => {
  assert.equal(zohoRequestTimeoutMs('GET', '/api/v1/purchaseorders/1'), 10_000);
  assert.equal(zohoRequestTimeoutMs('POST', '/api/v1/items'), 10_000);
  assert.equal(zohoRequestTimeoutMs('POST', '/api/v1/purchasereceives'), 55_000);
  assert.equal(zohoRequestTimeoutMs('POST', '/api/v1/purchaseorders/1/markasreceived'), 55_000);
  assert.equal(zohoRequestTimeoutMs('POST', '/api/v1/purchaseorders/1/markasunreceived'), 55_000);
  assert.equal(zohoRequestTimeoutMs('PUT', '/api/v1/purchasereceives/1'), 10_000);
});
