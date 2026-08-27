import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUNTER_STEPS,
  blockingReason,
  canAdvance,
  emptyCounterDraft,
  hasAnyLine,
  hasServiceLine,
  needsSignature,
  nextStep,
  phoneDigits,
  prevStep,
  stepIndex,
  type CounterDraft,
} from './counter-intake-steps';

function draft(patch: Partial<CounterDraft> = {}): CounterDraft {
  return { ...emptyCounterDraft(), ...patch };
}

const RETAIL = {
  variationId: 'V1',
  sku: 'S1',
  productTitle: 'Ear tips',
  quantity: 1,
  unitAmountCents: 900,
};

const SERVICE = { productModel: 'QC35 II', serialNumber: 'SN1', price: '130' };

test('the step order is the documented 4-step IA', () => {
  assert.deepEqual([...COUNTER_STEPS], ['identity', 'cart', 'review', 'payment']);
});

test('phoneDigits ignores formatting', () => {
  assert.equal(phoneDigits('(555) 123-4567'), '5551234567');
  assert.equal(phoneDigits('+1 555 123 4567'), '5551234567');
  assert.equal(phoneDigits('555'), '555');
});

// ── identity ────────────────────────────────────────────────────────────────

test('identity blocks with no phone, and explains why', () => {
  const reason = blockingReason('identity', draft());
  assert.match(String(reason), /phone number/i);
  assert.equal(canAdvance('identity', draft()), false);
});

test('identity blocks on a partial phone rather than accepting it', () => {
  assert.match(String(blockingReason('identity', draft({ phone: '555' }))), /incomplete/i);
});

test('a complete phone alone is enough to leave identity', () => {
  // Name is advisory: the orchestrator falls back to the name on file for a
  // returning customer, so demanding it here would block a repeat visit.
  assert.equal(blockingReason('identity', draft({ phone: '5551234567' })), null);
});

test('a prior order number needs no extra field — the phone IS the second key', () => {
  const d = draft({ phone: '5551234567', priorOrderNumber: '4787' });
  assert.equal(blockingReason('identity', d), null);
});

// ── cart ────────────────────────────────────────────────────────────────────

test('cart blocks on an empty visit', () => {
  assert.match(String(blockingReason('cart', draft({ phone: '5551234567' }))), /service or an item/i);
});

test('a retail line alone satisfies cart', () => {
  const d = draft({ phone: '5551234567', retailLines: [RETAIL] });
  assert.equal(hasAnyLine(d), true);
  assert.equal(blockingReason('cart', d), null);
});

test('a service line alone satisfies cart', () => {
  const d = draft({ phone: '5551234567', service: SERVICE });
  assert.equal(blockingReason('cart', d), null);
});

test('a zero-quantity line does not count as an item', () => {
  const d = draft({ phone: '5551234567', retailLines: [{ ...RETAIL, quantity: 0 }] });
  assert.equal(hasAnyLine(d), false);
  assert.notEqual(blockingReason('cart', d), null);
});

// ── review / signature ──────────────────────────────────────────────────────

test('a service line owes a signature and review blocks until it is given', () => {
  const unsigned = draft({ phone: '5551234567', service: SERVICE });
  assert.equal(needsSignature(unsigned), true);
  assert.match(String(blockingReason('review', unsigned)), /signature is required/i);

  const signed = draft({ ...unsigned, signatureDataUrl: 'data:image/png;base64,AAA' });
  assert.equal(blockingReason('review', signed), null);
});

test('a RETAIL-ONLY sale never demands a signature', () => {
  // Asking a customer to sign a repair agreement to buy ear tips is both wrong
  // and a reason to walk away from the counter.
  const d = draft({ phone: '5551234567', retailLines: [RETAIL] });
  assert.equal(needsSignature(d), false);
  assert.equal(blockingReason('review', d), null);
});

test('a combined visit still owes exactly one signature', () => {
  const d = draft({ phone: '5551234567', retailLines: [RETAIL], service: SERVICE });
  assert.equal(needsSignature(d), true);
  assert.notEqual(blockingReason('review', d), null);
});

// ── the partial-selection regression (caught in the browser, not by a type) ──

test('a service line with a BLANK product model does not count as a line', () => {
  // ProductSelector reports a partial selection while the operator is still
  // drilling categories. Honoring it let Continue pass on an empty visit.
  const d = draft({ phone: '5551234567', service: { ...SERVICE, productModel: '' } });
  assert.equal(hasServiceLine(d), false);
  assert.equal(hasAnyLine(d), false);
  assert.notEqual(blockingReason('cart', d), null, 'cart must still block');
});

test('a blank service model does not demand a signature', () => {
  // Otherwise the customer is asked to sign for a product nobody has chosen.
  const d = draft({ phone: '5551234567', service: { ...SERVICE, productModel: '   ' } });
  assert.equal(needsSignature(d), false);
  assert.equal(blockingReason('review', d), null);
});

test('a real product model reinstates the service line', () => {
  const d = draft({ phone: '5551234567', service: SERVICE });
  assert.equal(hasServiceLine(d), true);
  assert.equal(needsSignature(d), true);
});

// ── navigation ──────────────────────────────────────────────────────────────

test('payment is terminal — never blocks, never advances past itself', () => {
  assert.equal(blockingReason('payment', draft()), null);
  assert.equal(nextStep('payment'), 'payment');
});

test('identity is the floor — back from it stays put', () => {
  assert.equal(prevStep('identity'), 'identity');
});

test('next and prev walk the sequence', () => {
  assert.equal(nextStep('identity'), 'cart');
  assert.equal(nextStep('cart'), 'review');
  assert.equal(nextStep('review'), 'payment');
  assert.equal(prevStep('payment'), 'review');
  assert.equal(prevStep('cart'), 'identity');
});

test('stepIndex drives the progress affordance', () => {
  assert.equal(stepIndex('identity'), 0);
  assert.equal(stepIndex('payment'), 3);
});

test('an empty draft starts clean', () => {
  const d = emptyCounterDraft();
  assert.equal(d.service, null);
  assert.deepEqual(d.retailLines, []);
  assert.equal(d.signatureDataUrl, null);
  assert.equal(hasAnyLine(d), false);
});
