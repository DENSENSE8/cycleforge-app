import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseMockLabel, resetMockLabelIdempotency } from './shipping-mock';

test('production environment is refused — no label object', () => {
  const out = purchaseMockLabel({ outcome: 'success', environment: 'production' });
  assert.equal(out.refusedLive, true);
  assert.equal(out.ok, false);
  assert.equal(out.errorClass, 'LivePostageRefused');
  assert.equal(out.result, null);
});

test('mock success returns the production LabelPurchaseResult shape', () => {
  resetMockLabelIdempotency();
  const out = purchaseMockLabel({ outcome: 'success', environment: 'mock', idempotencyKey: 'k-ok' });
  assert.equal(out.ok, true);
  assert.equal(out.livePostage, false);
  assert.equal(out.result?.cost, 0);
  assert.ok(out.result?.labelId);
  assert.ok(out.result?.trackingNumber);
  assert.ok(out.result?.labelDownload.pdf);
});

test('invalid address / timeout / carrier 5xx are classified, not generic 500s', () => {
  assert.equal(purchaseMockLabel({ outcome: 'invalid_address', environment: 'sandbox' }).errorClass, 'AddressInvalid');
  assert.equal(purchaseMockLabel({ outcome: 'timeout', environment: 'mock' }).errorClass, 'ProviderTimeout');
  assert.equal(purchaseMockLabel({ outcome: 'carrier_unavailable', environment: 'mock' }).errorClass, 'ProviderUnavailable');
});

test('duplicate idempotency key does not mint a second label id', () => {
  resetMockLabelIdempotency();
  const first = purchaseMockLabel({
    outcome: 'duplicate_idempotency',
    environment: 'mock',
    idempotencyKey: 'k-dup',
  });
  const second = purchaseMockLabel({
    outcome: 'duplicate_idempotency',
    environment: 'mock',
    idempotencyKey: 'k-dup',
  });
  assert.equal(first.result?.labelId, second.result?.labelId);
  assert.match(second.notes.join(' '), /Idempotent replay/);
});
