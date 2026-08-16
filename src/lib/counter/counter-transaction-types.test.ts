import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUNTER_TRANSACTION_STATUSES,
  computeCounterTotals,
  isCounterTransactionStatus,
  requiresSignature,
  serviceLineCents,
  type CounterRetailLine,
  type CounterServiceLine,
} from './counter-transaction-types';

function retail(patch: Partial<CounterRetailLine> = {}): CounterRetailLine {
  return {
    variationId: 'VAR1',
    sku: 'SKU-1',
    productTitle: 'Widget',
    quantity: 1,
    unitAmountCents: 1000,
    ...patch,
  };
}

function service(patch: Partial<CounterServiceLine> = {}): CounterServiceLine {
  return {
    productModel: 'QC35 II',
    serialNumber: 'SN123',
    price: '130',
    ...patch,
  };
}

test('computeCounterTotals sums quantity × unit across retail lines', () => {
  const { subtotalCents, totalCents } = computeCounterTotals({
    retailLines: [retail({ unitAmountCents: 1000, quantity: 2 }), retail({ unitAmountCents: 250 })],
  });
  assert.equal(subtotalCents, 2250);
  assert.equal(totalCents, 2250);
});

test('computeCounterTotals is zero for an empty visit', () => {
  assert.deepEqual(computeCounterTotals({}), { subtotalCents: 0, totalCents: 0 });
});

test('a service line adds to total but never to the retail subtotal', () => {
  const { subtotalCents, totalCents } = computeCounterTotals({
    retailLines: [retail({ unitAmountCents: 500 })],
    service: service({ price: '130' }),
  });
  assert.equal(subtotalCents, 500, 'subtotal stays retail-only');
  assert.equal(totalCents, 13500);
});

test('a repair-only visit totals the service line alone', () => {
  const { subtotalCents, totalCents } = computeCounterTotals({ service: service({ price: '89.99' }) });
  assert.equal(subtotalCents, 0);
  assert.equal(totalCents, 8999);
});

test('service price tolerates currency formatting', () => {
  assert.equal(serviceLineCents(service({ price: '$130.00' })), 13000);
  assert.equal(serviceLineCents(service({ price: ' 130 ' })), 13000);
  assert.equal(serviceLineCents(service({ price: '130.5' })), 13050);
});

test('an unparseable or negative quote contributes 0, never NaN', () => {
  // A bad quote must not render "$NaN" on a customer-facing receipt.
  for (const price of ['', 'call for quote', '-50', 'abc']) {
    const cents = serviceLineCents(service({ price }));
    assert.ok(Number.isFinite(cents), `${price} produced a non-finite value`);
    assert.equal(cents, 0, `${price} should contribute 0`);
  }
});

test('malformed retail quantity or unit price contributes 0, never NaN; negative unit is a credit', () => {
  const { totalCents } = computeCounterTotals({
    retailLines: [
      retail({ quantity: Number.NaN }),
      retail({ unitAmountCents: Number.NaN }),
      retail({ quantity: -3 }),
      retail({ unitAmountCents: -100 }),
      retail({ unitAmountCents: 700 }),
    ],
  });
  // Negative unitAmountCents is a buyback credit; NaN/negative qty contribute 0.
  assert.equal(totalCents, 600);
});

test('fractional quantities truncate rather than producing fractional cents', () => {
  const { totalCents } = computeCounterTotals({
    retailLines: [retail({ quantity: 2.9, unitAmountCents: 100 })],
  });
  assert.equal(totalCents, 200);
  assert.equal(Number.isInteger(totalCents), true);
});

test('requiresSignature tracks the presence of a service line', () => {
  assert.equal(requiresSignature({ service: service() }), true);
  assert.equal(requiresSignature({ service: null }), false, 'retail-only must not demand an agreement');
  assert.equal(requiresSignature({}), false);
});

test('the status union matches the DB CHECK vocabulary', () => {
  // Mirrors counter_transactions_status_chk — drift here is a silent 23514 at runtime.
  assert.deepEqual([...COUNTER_TRANSACTION_STATUSES], [
    'staged',
    'paid',
    'partially_paid',
    'abandoned',
    'voided',
  ]);
  assert.equal(isCounterTransactionStatus('partially_paid'), true);
  assert.equal(isCounterTransactionStatus('refunded'), false);
});
