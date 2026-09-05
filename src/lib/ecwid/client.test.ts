/**
 * DB-free unit tests for Ecwid REST helpers (invoice-pdf).
 * Run (with server-only shim):
 *   node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     src/lib/ecwid/client.test.ts
 */
import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';

afterEach(() => {
  mock.restoreAll();
});

test('fetchInvoicePdf returns PDF buffer on 200', async () => {
  const bytes = Buffer.from('%PDF-1.4 hello');
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.match(url, /\/orders\/4787\/invoice-pdf$/);
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    });
  });

  const { fetchInvoicePdf } = await import('./client');
  const buf = await fetchInvoicePdf('store1', 'tok', '4787');
  assert.equal(buf.equals(bytes), true);
});

test('fetchInvoicePdf throws EcwidApiError on non-OK', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('nope', { status: 404 }));

  const { fetchInvoicePdf, EcwidApiError } = await import('./client');
  await assert.rejects(
    () => fetchInvoicePdf('store1', 'tok', '4787'),
    (err: unknown) => {
      assert.ok(err instanceof EcwidApiError);
      assert.equal(err.status, 404);
      assert.match(err.message, /invoice-pdf failed \(404\)/);
      return true;
    },
  );
});

test('fetchInvoicePdf rejects empty orderRef', async () => {
  const { fetchInvoicePdf, EcwidApiError } = await import('./client');
  await assert.rejects(
    () => fetchInvoicePdf('store1', 'tok', '  '),
    (err: unknown) => err instanceof EcwidApiError && err.status === 400,
  );
});

// ── Channel order (CX0) ──────────────────────────────────────────────────────
//
// The mapper and the eligibility rule are PURE, so they are asserted against a
// redacted fixture rather than a live store. That is the whole point of
// extracting them: the field mapping is the part that silently rots when Ecwid
// changes a key, and it must not need a vault token to test.

/** A redacted GET-order body. Shapes only — no real customer, no real store. */
const ORDER_FIXTURE: Record<string, unknown> = {
  id: 'A1B2C3',
  orderNumber: 4787,
  createDate: '2026-08-30 11:02:15 +0000',
  paymentStatus: 'PAID',
  fulfillmentStatus: 'SHIPPED',
  currency: 'USD',
  total: 149.98,
  email: 'buyer@example.test',
  phone: '(555) 010-4477',
  billingPerson: {
    name: 'Jane Buyer',
    street: '12 Test Row',
    city: 'Springfield',
    stateOrProvinceName: 'Oregon',
    postalCode: '97403',
    countryCode: 'US',
    phone: '(555) 010-4477',
  },
  shippingPerson: { name: 'Jane Buyer', city: 'Springfield', countryCode: 'US' },
  items: [
    { id: '9001', sku: 'HUB-4', name: 'Four-port hub', quantity: 2, price: 49.99, total: 99.98 },
    { id: '9002', sku: 'CBL-1', name: 'Braided cable', quantity: 1, price: 50.0, total: 50.0 },
  ],
  refunds: [],
};

test('mapEcwidOrderToChannelOrder maps person, items and money to cents', async () => {
  const { mapEcwidOrderToChannelOrder } = await import('./client');
  const order = mapEcwidOrderToChannelOrder(ORDER_FIXTURE);

  assert.equal(order.provider, 'ecwid');
  assert.equal(order.id, 'A1B2C3');
  assert.equal(order.publicOrderNumber, '4787');
  assert.equal(order.paymentStatus, 'PAID');
  assert.equal(order.fulfillmentStatus, 'SHIPPED');
  // Decimal dollars → integer cents, exactly once, at the boundary.
  assert.equal(order.totalCents, 14998);
  assert.equal(order.email, 'buyer@example.test');
  assert.equal(order.billing?.name, 'Jane Buyer');
  assert.equal(order.billing?.stateOrProvince, 'Oregon');

  assert.equal(order.items.length, 2);
  assert.deepEqual(
    order.items.map((i) => [i.id, i.sku, i.quantity, i.unitAmountCents, i.extendedAmountCents]),
    [
      ['9001', 'HUB-4', 2, 4999, 9998],
      ['9002', 'CBL-1', 1, 5000, 5000],
    ],
  );
});

test('mapEcwidOrderToChannelOrder prefers the line total over price × quantity', async () => {
  const { mapEcwidOrderToChannelOrder } = await import('./client');
  // A per-line discount lives in `total` and nowhere in price × quantity —
  // re-deriving it would overcharge the return by the discount.
  const order = mapEcwidOrderToChannelOrder({
    id: 'X',
    items: [{ id: '1', name: 'Discounted', quantity: 2, price: 10.0, total: 15.0 }],
  });
  assert.equal(order.items[0].extendedAmountCents, 1500);
});

test('mapEcwidOrderToChannelOrder falls back to a positional line id', async () => {
  const { mapEcwidOrderToChannelOrder } = await import('./client');
  // A return write cites line ids; an empty one would cite nothing.
  const order = mapEcwidOrderToChannelOrder({ id: 'X', items: [{ name: 'Legacy', quantity: 1 }] });
  assert.equal(order.items[0].id, 'line-0');
});

test('mapEcwidOrderToChannelOrder sums refunds when no refundedAmount is reported', async () => {
  const { mapEcwidOrderToChannelOrder } = await import('./client');
  const order = mapEcwidOrderToChannelOrder({
    ...ORDER_FIXTURE,
    refunds: [
      { id: 'r1', amount: 49.99, reason: 'damaged', source: 'API', date: '2026-09-01' },
      { id: 'r2', amount: 0.01, reason: null, source: 'ADMIN', date: '2026-09-01' },
    ],
  });
  assert.equal(order.refundedCents, 5000);
  assert.equal(order.refunds[0].reason, 'damaged');
});

test('mapEcwidOrderToChannelOrder prefers the channel refundedAmount over the sum', async () => {
  const { mapEcwidOrderToChannelOrder } = await import('./client');
  // refundedAmount is the figure a refund WRITE moves — the one Slice 0 reads
  // back to decide whether the write moved money at all.
  const order = mapEcwidOrderToChannelOrder({
    ...ORDER_FIXTURE,
    refundedAmount: 149.98,
    refunds: [{ id: 'r1', amount: 49.99 }],
  });
  assert.equal(order.refundedCents, 14998);
});

test('assessChannelReturn allows a return within the unrefunded balance', async () => {
  const { mapEcwidOrderToChannelOrder, assessChannelReturn } = await import('./client');
  const order = mapEcwidOrderToChannelOrder(ORDER_FIXTURE);
  const verdict = assessChannelReturn(order, 9998);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.refundableCents, 14998);
});

test('assessChannelReturn refuses an unpaid or cancelled order as NOT_REFUNDABLE', async () => {
  const { mapEcwidOrderToChannelOrder, assessChannelReturn } = await import('./client');
  for (const paymentStatus of ['AWAITING_PAYMENT', 'CANCELLED', 'INCOMPLETE']) {
    const order = mapEcwidOrderToChannelOrder({ ...ORDER_FIXTURE, paymentStatus });
    const verdict = assessChannelReturn(order);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok === false && verdict.refusal, 'NOT_REFUNDABLE');
  }
});

test('assessChannelReturn refuses a fully refunded order as ALREADY_REFUNDED', async () => {
  const { mapEcwidOrderToChannelOrder, assessChannelReturn } = await import('./client');
  const order = mapEcwidOrderToChannelOrder({ ...ORDER_FIXTURE, refundedAmount: 149.98 });
  const verdict = assessChannelReturn(order, 100);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.refusal, 'ALREADY_REFUNDED');
});

test('assessChannelReturn refuses an over-large amount as PARTIAL_ONLY', async () => {
  const { mapEcwidOrderToChannelOrder, assessChannelReturn } = await import('./client');
  // Named apart from ALREADY_REFUNDED: the fix is to lower the amount, not to
  // walk away.
  const order = mapEcwidOrderToChannelOrder({ ...ORDER_FIXTURE, refundedAmount: 100.0 });
  const verdict = assessChannelReturn(order, 14998);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.refusal, 'PARTIAL_ONLY');
  assert.equal(verdict.refundableCents, 4998);
});

test('interpretChannelOrderResponse maps 404 to NOT_FOUND', async () => {
  const { interpretChannelOrderResponse, ChannelOrderError } = await import('./client');
  assert.throws(
    () => interpretChannelOrderResponse({ ref: '4787', status: 404, ok: false, body: null }),
    (err: unknown) => err instanceof ChannelOrderError && err.refusal === 'NOT_FOUND',
  );
});

test('interpretChannelOrderResponse maps any other non-OK to LOOKUP_FAILED', async () => {
  const { interpretChannelOrderResponse, ChannelOrderError } = await import('./client');
  assert.throws(
    () =>
      interpretChannelOrderResponse({
        ref: '4787',
        status: 403,
        ok: false,
        body: null,
        errorText: 'token lacks read_orders',
      }),
    (err: unknown) => {
      assert.ok(err instanceof ChannelOrderError);
      assert.equal(err.refusal, 'LOOKUP_FAILED');
      // The vendor's own words survive — a scope problem is a settings fix,
      // and 'lookup failed' alone does not tell an operator that.
      assert.match(err.message, /token lacks read_orders/);
      return true;
    },
  );
});

test('interpretChannelOrderResponse treats a 200 with no id as NOT_FOUND', async () => {
  const { interpretChannelOrderResponse, ChannelOrderError } = await import('./client');
  assert.throws(
    () => interpretChannelOrderResponse({ ref: '4787', status: 200, ok: true, body: {} }),
    (err: unknown) => err instanceof ChannelOrderError && err.refusal === 'NOT_FOUND',
  );
});

test('interpretChannelOrderResponse returns the mapped order on 200', async () => {
  const { interpretChannelOrderResponse } = await import('./client');
  const order = interpretChannelOrderResponse({
    ref: '4787',
    status: 200,
    ok: true,
    body: ORDER_FIXTURE,
  });
  assert.equal(order.publicOrderNumber, '4787');
  assert.equal(order.items.length, 2);
});
