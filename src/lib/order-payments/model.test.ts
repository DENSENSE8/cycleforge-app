/**
 * Order payments — the amount is the order's own rows, Square's lines sum to
 * it exactly, and only real outcomes move a request's status.
 * Run: npx tsx --test src/lib/order-payments/model.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSquareOrder,
  buildStripeCheckoutSessionForm,
  computeOrderCharge,
  e164Phone,
  orderPaymentState,
  squarePaymentEventEffect,
  statusForInvoice,
  statusForSquareOrder,
  statusForStripeSession,
  stripeCheckoutEventEffect,
  stripeEventOrgId,
  type OrderChargeRow,
} from './model';

const row = (over: Partial<OrderChargeRow>): OrderChargeRow => ({
  id: 1, order_id: 'PH-1', sku: 'SKU-1', product_title: 'Bose 151 bracket', quantity: '1', sale_amount: '39.00', currency: 'USD', customer_id: 7, ...over,
});

test('charge = sum of line totals; sale_amount is the LINE total', () => {
  const out = computeOrderCharge('PH-1', [row({ quantity: '2', sale_amount: '78.00' }), row({ id: 2, sku: 'SKU-2', sale_amount: '10.50' })], 'USD');
  assert.ok(out.ok);
  if (!out.ok) return;
  assert.equal(out.charge.totalCents, 8850);
  assert.deepEqual(out.charge.lines.map((l) => [l.qty, l.unitPriceCents, l.lineCents]), [[2, 3900, 7800], [1, 1050, 1050]]);
  assert.deepEqual(out.charge.orderIds, [1, 2]);
  assert.equal(out.charge.customerId, 7);
});

test('a line without a price, an unknown order, or mixed currencies cannot be charged', () => {
  assert.equal(computeOrderCharge('PH-1', [], 'USD').ok, false);
  assert.equal(computeOrderCharge('PH-1', [row({ sale_amount: null })], 'USD').ok, false);
  assert.equal(computeOrderCharge('PH-1', [row({ sale_amount: '0' })], 'USD').ok, false);
  assert.equal(computeOrderCharge('PH-1', [row({}), row({ id: 2, currency: 'CAD' })], 'USD').ok, false);
});

test('two different customers on one order → no single customer to invoice', () => {
  const out = computeOrderCharge('PH-1', [row({}), row({ id: 2, customer_id: 8 })], 'USD');
  assert.ok(out.ok && out.charge.customerId === null);
});

test('Square line items sum to the charge to the cent, even when qty does not divide the total', () => {
  const out = computeOrderCharge('PH-1', [row({ quantity: '3', sale_amount: '10.00' }), row({ id: 2, quantity: '2', sale_amount: '5.00' })], 'USD');
  assert.ok(out.ok);
  if (!out.ok) return;
  const order = buildSquareOrder({ locationId: 'L', orderNumber: 'PH-1', orgId: 'org', paymentId: 9, currency: 'USD', lines: out.charge.lines }) as {
    line_items: Array<{ quantity: string; base_price_money: { amount: number } }>;
    metadata: Record<string, string>;
  };
  const squareTotal = order.line_items.reduce((s, li) => s + Number(li.quantity) * li.base_price_money.amount, 0);
  assert.equal(squareTotal, out.charge.totalCents);
  assert.deepEqual(order.metadata, { cf_org: 'org', cf_payment: '9', cf_order: 'PH-1' });
});

test('phones Square would reject are dropped, not sent', () => {
  assert.equal(e164Phone('(555) 867-5309'), '+15558675309');
  assert.equal(e164Phone('+44 20 7946 0958'), '+442079460958');
  assert.equal(e164Phone('867-5309'), null);
});

test('only a COMPLETED payment marks paid; a failed card attempt leaves the link open', () => {
  const pay = (status: string) => ({ type: 'payment.updated', data: { object: { payment: { id: 'P1', order_id: 'O1', status } } } });
  assert.deepEqual(squarePaymentEventEffect(pay('COMPLETED')), { status: 'paid', squareOrderId: 'O1', squareInvoiceId: null, squarePaymentId: 'P1' });
  assert.equal(squarePaymentEventEffect(pay('FAILED')), null);
  assert.equal(squarePaymentEventEffect(pay('APPROVED')), null);
});

test('invoice and refund events map to their outcomes', () => {
  const inv = (type: string, status: string) => ({ type, data: { object: { invoice: { id: 'I1', order_id: 'O1', status } } } });
  assert.equal(squarePaymentEventEffect(inv('invoice.payment_made', 'PAID'))?.status, 'paid');
  assert.equal(squarePaymentEventEffect(inv('invoice.payment_made', 'PARTIALLY_PAID')), null);
  assert.equal(squarePaymentEventEffect(inv('invoice.canceled', 'CANCELED'))?.status, 'cancelled');
  assert.equal(squarePaymentEventEffect(inv('invoice.published', 'UNPAID'))?.status, 'sent');
  const refund = { type: 'refund.updated', data: { object: { refund: { payment_id: 'P1', order_id: 'O1', status: 'COMPLETED' } } } };
  assert.deepEqual(squarePaymentEventEffect(refund), { status: 'refunded', squareOrderId: 'O1', squareInvoiceId: null, squarePaymentId: 'P1' });
  assert.equal(squarePaymentEventEffect({ type: 'order.updated', data: {} }), null);
});

test('poll fallback: tenders covering the amount = paid; a cancelled order = cancelled', () => {
  assert.deepEqual(statusForSquareOrder({ state: 'OPEN', tenders: [{ id: 'T', payment_id: 'P', amount_money: { amount: 100 } }] }, 100), { status: 'paid', paymentId: 'P' });
  assert.equal(statusForSquareOrder({ state: 'OPEN', tenders: [{ amount_money: { amount: 50 } }] }, 100).status, null);
  assert.equal(statusForSquareOrder({ state: 'CANCELED' }, 100).status, 'cancelled');
  assert.equal(statusForInvoice('DRAFT'), null);
  assert.equal(statusForInvoice('UNPAID'), 'sent');
});

test('order payment state follows the latest request', () => {
  assert.equal(orderPaymentState(null), 'unpaid');
  assert.equal(orderPaymentState({ method: 'square_invoice', status: 'sent' }), 'invoice_sent');
  assert.equal(orderPaymentState({ method: 'square_link', status: 'pending' }), 'link_sent');
  assert.equal(orderPaymentState({ method: 'square_link', status: 'paid' }), 'paid');
  assert.equal(orderPaymentState({ method: 'square_link', status: 'cancelled' }), 'unpaid');
});

const ORG = '0b7f3c2a-1d4e-4a5b-9c8d-7e6f5a4b3c2d';

test('Stripe Checkout line items sum to the charge to the cent and carry our metadata on session + intent', () => {
  const out = computeOrderCharge('PH-1', [row({ quantity: '3', sale_amount: '10.00' }), row({ id: 2, quantity: '2', sale_amount: '5.00' })], 'USD');
  assert.ok(out.ok);
  if (!out.ok) return;
  const form = buildStripeCheckoutSessionForm({
    orgId: ORG, paymentId: 9, orderNumber: 'PH-1', currency: 'USD', lines: out.charge.lines, customerEmail: 'not-an-email', successUrl: 'https://app/pay',
  });
  let total = 0;
  for (let i = 0; form[`line_items[${i}][quantity]`]; i++) {
    total += Number(form[`line_items[${i}][quantity]`]) * Number(form[`line_items[${i}][price_data][unit_amount]`]);
    assert.equal(form[`line_items[${i}][price_data][currency]`], 'usd');
  }
  assert.equal(total, out.charge.totalCents);
  assert.equal(form.mode, 'payment');
  assert.equal(form['metadata[organizationId]'], ORG);
  assert.equal(form['payment_intent_data[metadata][orderPaymentId]'], '9');
  assert.equal(form.customer_email, undefined);
});

test('Stripe events: only a paid session is paid; async failure fails; expiry cancels; foreign sessions are ignored', () => {
  const ev = (type: string, over: Record<string, unknown> = {}) => ({
    type,
    data: { object: { object: 'checkout.session', id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', metadata: { organizationId: ORG, orderPaymentId: '9' }, ...over } },
  });
  assert.deepEqual(stripeCheckoutEventEffect(ev('checkout.session.completed')), {
    status: 'paid', orgId: ORG, paymentId: 9, sessionId: 'cs_1', paymentIntentId: 'pi_1', lastError: null,
  });
  assert.equal(stripeCheckoutEventEffect(ev('checkout.session.completed', { payment_status: 'unpaid' })), null);
  assert.equal(stripeCheckoutEventEffect(ev('checkout.session.async_payment_succeeded', { payment_status: 'unpaid' }))?.status, 'paid');
  assert.equal(stripeCheckoutEventEffect(ev('checkout.session.async_payment_failed'))?.status, 'failed');
  assert.equal(stripeCheckoutEventEffect(ev('checkout.session.expired', { payment_status: 'unpaid' }))?.status, 'cancelled');
  assert.equal(stripeCheckoutEventEffect(ev('checkout.session.completed', { metadata: {} })), null);
  assert.equal(stripeCheckoutEventEffect(ev('checkout.session.completed', { metadata: { organizationId: 'nope', orderPaymentId: '9' } })), null);
  assert.equal(stripeCheckoutEventEffect({ type: 'payment_intent.succeeded', data: { object: { object: 'payment_intent', metadata: { organizationId: ORG, orderPaymentId: '9' } } } }), null);
  assert.equal(stripeEventOrgId(ev('checkout.session.completed')), ORG);
});

test('Stripe poll fallback: paid session = paid; expired = cancelled; open = no change', () => {
  assert.deepEqual(statusForStripeSession({ status: 'complete', payment_status: 'paid', payment_intent: { id: 'pi_1' } }), { status: 'paid', paymentIntentId: 'pi_1' });
  assert.equal(statusForStripeSession({ status: 'expired', payment_status: 'unpaid' }).status, 'cancelled');
  assert.equal(statusForStripeSession({ status: 'open', payment_status: 'unpaid' }).status, null);
  assert.equal(orderPaymentState({ method: 'stripe_link', status: 'pending' }), 'link_sent');
});
