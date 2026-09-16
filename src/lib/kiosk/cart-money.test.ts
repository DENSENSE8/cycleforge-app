/**
 * cartMoneySplit — when a walk-in visit's money is due.
 *
 * Operator 2026-09-15: *"a repair service on drop off never takes money off, it
 * just prints out a receipt."* What this defends is that rule and its two
 * consequences: a service-only visit offers no Pay key at all, and a MIXED
 * visit stays one staged header with two stated numbers.
 *
 *   npx tsx --test src/lib/kiosk/cart-money.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { cartMoneySplit } from './cart-money';
import type { KioskCartLine } from './cart-line';

const retail = (cents: number, quantity = 1): KioskCartLine => ({
  id: `r${cents}-${quantity}`,
  type: 'RETAIL',
  title: 'Speaker cable',
  quantity,
  unitAmountCents: cents,
  payload: { variationId: null, sku: 'CABLE-1' },
});

const repair = (cents: number): KioskCartLine => ({
  id: `s${cents}`,
  type: 'REPAIR',
  title: 'Bose 321 — no power',
  quantity: 1,
  unitAmountCents: cents,
  payload: { productModel: 'Bose 321', serialNumber: 'SN-1', price: String(cents / 100) },
});

const tradeIn = (creditCents: number): KioskCartLine => ({
  id: `b${creditCents}`,
  type: 'BUYBACK',
  title: 'iPhone 12 trade-in',
  quantity: 1,
  unitAmountCents: -creditCents,
  payload: { imei: '35-209900-176148-1' },
});

test('a drop-off takes no money — the quote is due at pickup', () => {
  const money = cartMoneySplit([repair(8600)]);
  assert.equal(money.dueNowCents, 0);
  assert.equal(money.dueAtPickupCents, 8600);
  assert.equal(money.totalCents, 8600);
  assert.equal(money.takesPaymentNow, false);
});

test('goods are due now', () => {
  const money = cartMoneySplit([retail(2400, 2)]);
  assert.equal(money.dueNowCents, 4800);
  assert.equal(money.dueAtPickupCents, 0);
  assert.equal(money.takesPaymentNow, true);
});

test('a mixed visit splits without splitting the ticket', () => {
  // Drop off a receiver AND buy a cable: one header staged at the full total,
  // the cable payable at the counter, the service payable at collection.
  const money = cartMoneySplit([repair(8600), retail(2400)]);
  assert.equal(money.dueNowCents, 2400);
  assert.equal(money.dueAtPickupCents, 8600);
  assert.equal(money.totalCents, 11_000);
  assert.equal(money.takesPaymentNow, true);
});

test('a trade-in credit subtracts from what is due now, and can invert it', () => {
  const partExchange = cartMoneySplit([retail(30_000), tradeIn(10_000)]);
  assert.equal(partExchange.dueNowCents, 20_000);
  assert.equal(partExchange.takesPaymentNow, true);

  // Pure trade-in: the money moves toward the CUSTOMER, so the counter is not
  // taking a payment and must not offer a Pay key.
  const payout = cartMoneySplit([tradeIn(10_000)]);
  assert.equal(payout.dueNowCents, -10_000);
  assert.equal(payout.takesPaymentNow, false);
});

test('an empty ticket owes nothing and takes nothing', () => {
  assert.deepEqual(cartMoneySplit([]), {
    dueNowCents: 0,
    dueAtPickupCents: 0,
    totalCents: 0,
    takesPaymentNow: false,
  });
});

test('a $0 service still reads as a drop-off, not as a payable visit', () => {
  const money = cartMoneySplit([repair(0)]);
  assert.equal(money.takesPaymentNow, false);
  assert.equal(money.dueAtPickupCents, 0);
});
