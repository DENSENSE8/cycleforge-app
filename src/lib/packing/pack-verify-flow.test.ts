import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePackVerifyOutcome, extractTrackingCandidate } from './pack-verify-flow';

test('no tracking determined → ERROR_OCR_FAILED', () => {
  assert.deepEqual(resolvePackVerifyOutcome({ tracking: '', verify: null }), {
    outcome: 'ERROR_OCR_FAILED',
    detectedTracking: null,
    detectedOrderId: null,
  });
  assert.equal(resolvePackVerifyOutcome({ tracking: '   ', verify: null }).outcome, 'ERROR_OCR_FAILED');
  assert.equal(resolvePackVerifyOutcome({ tracking: null, verify: { found: true } }).outcome, 'ERROR_OCR_FAILED');
});

test('tracking + order found → VERIFIED with detected refs', () => {
  const r = resolvePackVerifyOutcome({ tracking: '1Z999', verify: { found: true, orderId: 'ORD-1' } });
  assert.equal(r.outcome, 'VERIFIED');
  assert.equal(r.detectedTracking, '1Z999');
  assert.equal(r.detectedOrderId, 'ORD-1');
});

test('tracking + order NOT found → ERROR_MISSING_TRACKING', () => {
  assert.equal(
    resolvePackVerifyOutcome({ tracking: '1Z999', verify: { found: false } }).outcome,
    'ERROR_MISSING_TRACKING',
  );
});

test('tracking present but unconfirmable (verify null) → ERROR_MISSING_TRACKING (routes to review)', () => {
  const r = resolvePackVerifyOutcome({ tracking: '1Z999', verify: null });
  assert.equal(r.outcome, 'ERROR_MISSING_TRACKING');
  assert.equal(r.detectedTracking, '1Z999');
  assert.equal(r.detectedOrderId, null);
});

test('tracking is trimmed before use', () => {
  const r = resolvePackVerifyOutcome({ tracking: '  1Z999  ', verify: { found: true } });
  assert.equal(r.detectedTracking, '1Z999');
});

// ── §2c OCR tracking extraction ──────────────────────────────────────────────

test('extractTrackingCandidate: a UPS 1Z code wins over a shorter digit run', () => {
  const text = 'SHIP TO 123 MAIN ST\nORDER 5551234\n1Z999AA10123456784\nWEIGHT 2LB';
  assert.equal(extractTrackingCandidate(text), '1Z999AA10123456784');
});

test('extractTrackingCandidate: longest 12–22 digit run when no UPS code', () => {
  const text = 'USPS TRACKING 9400111899223399887766 REF 5551234';
  assert.equal(extractTrackingCandidate(text), '9400111899223399887766');
});

test('extractTrackingCandidate: lowercase input is matched (case-insensitive)', () => {
  assert.equal(extractTrackingCandidate('tracking 1z999aa10123456784'), '1Z999AA10123456784');
});

test('extractTrackingCandidate: no tracking-shaped token → null', () => {
  assert.equal(extractTrackingCandidate('PACKING SLIP order 42 qty 1'), null);
  assert.equal(extractTrackingCandidate(''), null);
  assert.equal(extractTrackingCandidate(null), null);
});
