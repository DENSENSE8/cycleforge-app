/**
 * cartStepGates — the kiosk cart's progress contract (PG6).
 *
 * The stepper's segments, its count and each step's Continue key all read this
 * one table, so what it must defend is: a satisfied unit counts wherever the
 * pointer is, un-satisfying it takes the segment back, warnings never gate, and
 * the gates stay derived from `collectKioskTriage` instead of growing a second
 * opinion about what a complete visit is.
 *
 *   npx tsx --test src/lib/kiosk/cart-step-gates.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KIOSK_CART_STEPS,
  cartCompletedSteps,
  cartStepBlockReason,
  cartStepGates,
} from './cart-step-gates';
import type { KioskCartLine } from './cart-line';
import type { KioskTriageSession } from './visit-triage';

const retail = (over: Partial<KioskCartLine> = {}): KioskCartLine => ({
  id: 'l1',
  type: 'RETAIL',
  title: 'Guitar strap',
  quantity: 1,
  unitAmountCents: 2400,
  payload: { variationId: null, sku: 'STRAP-1' },
  ...over,
});

const repair = (over: Partial<KioskCartLine> = {}): KioskCartLine => ({
  id: 'l2',
  type: 'REPAIR',
  title: 'Bose 321 — no power',
  quantity: 1,
  unitAmountCents: 8600,
  payload: {
    productModel: 'Bose 321',
    repairReasons: ['No power'],
    serialNumber: 'SN-1',
    price: '86.00',
    signatureDataUrl: 'data:image/png;base64,AAA',
  },
  ...over,
});

/** A visit with nothing wrong with it: one clean retail line, phone on file. */
const clean = (over: Partial<KioskTriageSession> = {}): KioskTriageSession => ({
  lines: [retail()],
  customerPhone: '5551234567',
  customerName: 'Ada',
  customerEmail: 'ada@example.com',
  customerAddress: '1 Mill St',
  ...over,
});

const empty: KioskTriageSession = {
  lines: [],
  customerPhone: '',
  customerName: '',
  customerEmail: '',
  customerAddress: '',
};

test('an empty visit has no satisfied units', () => {
  assert.deepEqual(cartStepGates(empty), [false, false, false]);
  assert.equal(cartCompletedSteps(empty), 0);
});

test('a clean visit satisfies every unit', () => {
  assert.deepEqual(cartStepGates(clean()), [true, true, true]);
  assert.equal(cartCompletedSteps(clean()), KIOSK_CART_STEPS.length);
});

test('an empty ticket un-fills Items, not just Pay', () => {
  // The empty-cart blocker is target:'cart'. Filing it only under Pay would
  // leave the Items segment filled on a visit with no items in it.
  const noLines = clean({ lines: [] });
  assert.deepEqual(cartStepGates(noLines), [false, true, false]);
  assert.match(cartStepBlockReason(noLines, 0) ?? '', /Cart is empty/);
});

test('a line blocker gates Items and Pay, never Customer', () => {
  // A repair drop-off with no signature: a target:'line' blocker.
  const signed = repair();
  const noSignature = clean({
    lines: [{ ...signed, payload: { ...signed.payload, signatureDataUrl: null } }],
  });
  assert.deepEqual(cartStepGates(clean({ lines: [signed] })), [true, true, true]);
  assert.deepEqual(cartStepGates(noSignature), [false, true, false]);
  assert.match(cartStepBlockReason(noSignature, 0) ?? '', /signature/i);
  assert.equal(cartStepBlockReason(noSignature, 1), null);
});

test('phone is the only customer gate — name, email and address are warnings', () => {
  const noPhone = clean({ customerPhone: '' });
  assert.deepEqual(cartStepGates(noPhone), [true, false, false]);
  assert.match(cartStepBlockReason(noPhone, 1) ?? '', /phone number/i);

  const anonymous = clean({ customerName: '', customerEmail: '', customerAddress: '' });
  assert.deepEqual(cartStepGates(anonymous), [true, true, true]);
  assert.equal(cartStepBlockReason(anonymous, 1), null);
});

test('a warning never holds a segment — a $0 retail line still advances', () => {
  const free = clean({ lines: [retail({ unitAmountCents: 0 })] });
  assert.deepEqual(cartStepGates(free), [true, true, true]);
});

test('a satisfied unit counts regardless of which step is on screen (PG6)', () => {
  // The pointer is not an input: cartStepGates takes no step index at all, so
  // paging to Pay on an empty ticket cannot render 3/3.
  assert.equal(cartCompletedSteps(clean({ lines: [] })), 1);
  assert.equal(cartCompletedSteps(clean({ customerPhone: '' })), 1);
});

test('clearing an earlier unit takes its segment back', () => {
  assert.equal(cartCompletedSteps(clean()), 3);
  const voided = clean({ lines: [] });
  assert.equal(cartCompletedSteps(voided), 1);
  assert.equal(cartStepGates(voided)[2], false);
});
