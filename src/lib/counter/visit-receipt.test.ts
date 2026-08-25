/**
 *   node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     --test src/lib/counter/visit-receipt.test.ts
 *
 * DB-free — both `buildVisitReceipt` and `renderVisitReceiptHtml` are pure
 * functions of a hand-built `CounterVisit` / `VisitReceipt`, so every case
 * below is a fixture, never a fake DB call.
 *
 * The two rules worth breaking a build over: a voided line is desk evidence,
 * not something the customer paid for, so it is dropped from the customer
 * receipt; and the printed HTML carries zero external references, because
 * the operator's requirement is a receipt that still prints when the shop's
 * internet is down.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrgLetterhead } from '@/lib/branding/letterhead';
import type {
  CounterVisit,
  CounterVisitCustomer,
  CounterVisitDevice,
  CounterVisitLine,
  CounterVisitSquareTransaction,
} from './read-visit';
import { buildVisitReceipt } from './visit-receipt';
import { renderVisitReceiptHtml } from './visit-receipt-html';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function letterhead(overrides: Partial<OrgLetterhead> = {}): OrgLetterhead {
  return {
    name: 'Cycle Forge Repair Co.',
    addressLine1: '123 Main St',
    addressLine2: 'Suite 4',
    phone: '(555) 867-5309',
    email: 'shop@example.com',
    ...overrides,
  };
}

function device(overrides: Partial<CounterVisitDevice> = {}): CounterVisitDevice {
  return {
    id: 1,
    rsNumber: 'RS-0001',
    serialNumber: 'SN-1',
    productTitle: 'QuietComfort 45',
    status: 'Pending Repair',
    quoteCents: 13000,
    quoteRaw: '$130.00',
    hasSignature: true,
    signatureUrl: 'https://blob.example/sig-1.png',
    signedAt: '2026-08-22 09:58:00',
    createdAt: '2026-08-22 09:55:00',
    ...overrides,
  };
}

function line(overrides: Partial<CounterVisitLine> = {}): CounterVisitLine {
  return {
    id: 'line-1',
    type: 'RETAIL',
    title: 'Bose Earbuds Case',
    quantity: 1,
    unitAmountCents: 4999,
    payload: { variationId: null, sku: 'CASE-1' },
    sortIndex: 0,
    voidedAt: null,
    voidReason: null,
    voidedByStaffId: null,
    voidedByStaffName: null,
    ...overrides,
  };
}

function squareTransaction(
  overrides: Partial<CounterVisitSquareTransaction> = {},
): CounterVisitSquareTransaction {
  return {
    id: 'sqt-1',
    squareOrderId: 'sq-order-1',
    squarePaymentId: 'sq-payment-1',
    status: 'COMPLETED',
    paymentMethod: 'CARD',
    receiptUrl: null,
    subtotalCents: null,
    taxCents: null,
    totalCents: null,
    discountCents: null,
    createdAt: '2026-08-22 10:10:00',
    ...overrides,
  };
}

function customer(overrides: Partial<CounterVisitCustomer> = {}): CounterVisitCustomer {
  return { id: 1, name: 'Jane Doe', phone: '555-111-2222', email: 'jane@example.com', ...overrides };
}

function visit(overrides: Partial<CounterVisit> = {}): CounterVisit {
  return {
    id: 100,
    status: 'staged',
    subtotalCents: 0,
    totalCents: 0,
    stagedSquareOrderId: null,
    priorOrderRef: null,
    createdAt: '2026-08-22 10:00:00',
    updatedAt: '2026-08-22 10:05:00',
    customer: null,
    devices: [],
    lines: [],
    payment: { squareTransaction: null, sessionPaymentState: null },
    claimedByStaffId: null,
    claimedByStaffName: null,
    auditTrail: [],
    ...overrides,
  };
}

// ── buildVisitReceipt ────────────────────────────────────────────────────────

describe('buildVisitReceipt', () => {
  it('a retail-only visit: line items, no repairs', () => {
    const v = visit({
      subtotalCents: 9998,
      totalCents: 9998,
      lines: [line({ id: 'l1', quantity: 2, unitAmountCents: 4999 })],
    });
    const r = buildVisitReceipt(v, letterhead());

    assert.equal(r.repairs.length, 0);
    assert.equal(r.lineItems.length, 1);
    assert.equal(r.lineItems[0].extendedAmountCents, 9998);
    assert.equal(r.subtotalCents, 9998);
    assert.equal(r.totalCents, 9998);
    assert.equal(r.barcodeValue, `CT-${v.id}`, 'no single device — falls back to the visit id');
  });

  it('a repair-only visit: repairs from devices, no line items, RS number as the barcode', () => {
    const v = visit({
      subtotalCents: 0,
      totalCents: 13000,
      devices: [device()],
    });
    const r = buildVisitReceipt(v, letterhead());

    assert.equal(r.lineItems.length, 0);
    assert.equal(r.repairs.length, 1);
    assert.equal(r.repairs[0].rsNumber, 'RS-0001');
    assert.equal(r.repairs[0].quoteCents, 13000);
    assert.equal(r.totalCents, 13000);
    assert.equal(r.barcodeValue, 'RS-0001', 'exactly one device — the RS number stands in for the visit');
  });

  it('a mixed visit: retail lines AND repairs both print, and the REPAIR-type cart line is NOT re-printed as a line item', () => {
    const v = visit({
      subtotalCents: 4999,
      totalCents: 4999 + 13000,
      devices: [device()],
      lines: [
        line({ id: 'l1', title: 'Case', quantity: 1, unitAmountCents: 4999 }),
        // The cart's own ledger entry for the SAME device above — must not
        // become a second line item alongside `repairs[0]`.
        line({
          id: 'l2',
          type: 'REPAIR',
          title: 'QuietComfort 45 repair',
          quantity: 1,
          unitAmountCents: 13000,
          payload: { productModel: 'QC45', serialNumber: 'SN-1', price: '$130.00' },
        }),
      ],
    });
    const r = buildVisitReceipt(v, letterhead());

    assert.equal(r.lineItems.length, 1, 'only the retail line — the REPAIR-type line is deduped against devices');
    assert.equal(r.lineItems[0].title, 'Case');
    assert.equal(r.repairs.length, 1);
    assert.equal(r.barcodeValue, 'RS-0001', 'two devices? no — one device, one repair line dropped');
  });

  it('totals add up: subtotal is line items only, total is subtotal + every repair quote', () => {
    const v = visit({
      subtotalCents: 4999 - 1500, // a retail line plus a buyback credit
      totalCents: 4999 - 1500 + 13000,
      devices: [device({ id: 2, rsNumber: 'RS-0002', quoteCents: 13000 })],
      lines: [
        line({ id: 'l1', title: 'Case', quantity: 1, unitAmountCents: 4999 }),
        line({
          id: 'l2',
          type: 'BUYBACK',
          title: 'Trade-in credit',
          quantity: 1,
          unitAmountCents: -1500,
          payload: { imei: '123456789012345' },
        }),
      ],
    });
    const r = buildVisitReceipt(v, letterhead());

    const lineItemSum = r.lineItems.reduce((sum, i) => sum + i.extendedAmountCents, 0);
    const repairSum = r.repairs.reduce((sum, d) => sum + d.quoteCents, 0);
    assert.equal(lineItemSum, r.subtotalCents);
    assert.equal(r.subtotalCents + repairSum, r.totalCents);
  });

  it('a voided line is excluded from the customer receipt', () => {
    const v = visit({
      subtotalCents: 4999, // header total reflects the visit as it stands — the void already adjusted it upstream
      totalCents: 4999,
      lines: [
        line({ id: 'l1', title: 'Kept item', quantity: 1, unitAmountCents: 4999 }),
        line({
          id: 'l2',
          title: 'Voided item',
          quantity: 1,
          unitAmountCents: 2000,
          voidedAt: '2026-08-22 10:02:00',
          voidReason: 'Customer changed mind',
          voidedByStaffId: 7,
          voidedByStaffName: 'Sam Staff',
        }),
      ],
    });
    const r = buildVisitReceipt(v, letterhead());

    assert.equal(r.lineItems.length, 1);
    assert.equal(r.lineItems[0].id, 'l1');
    assert.ok(!r.lineItems.some((i) => i.id === 'l2'), 'the voided line never reaches the customer document');
  });

  it('a partially_paid visit shows what was paid and the balance still owed', () => {
    const v = visit({
      status: 'partially_paid',
      subtotalCents: 10000,
      totalCents: 10000,
      payment: {
        squareTransaction: squareTransaction({ totalCents: 4000, paymentMethod: 'CASH', taxCents: 300 }),
        sessionPaymentState: null,
      },
    });
    const r = buildVisitReceipt(v, letterhead());

    assert.equal(r.payment.status, 'partially_paid');
    assert.equal(r.payment.tender, 'CASH');
    assert.equal(r.payment.amountPaidCents, 4000);
    assert.equal(r.payment.amountDueCents, 6000);
    assert.equal(r.payment.taxCents, 300);
  });

  it('a paid visit owes nothing, even if the settled row disagrees slightly', () => {
    const v = visit({
      status: 'paid',
      totalCents: 5000,
      payment: { squareTransaction: squareTransaction({ totalCents: 5200 }), sessionPaymentState: null },
    });
    const r = buildVisitReceipt(v, letterhead());
    assert.equal(r.payment.amountDueCents, 0);
    assert.equal(r.payment.amountPaidCents, 5200);
  });

  it('a voided visit owes nothing regardless of totalCents', () => {
    const v = visit({ status: 'voided', totalCents: 8000 });
    const r = buildVisitReceipt(v, letterhead());
    assert.equal(r.payment.amountPaidCents, 0);
    assert.equal(r.payment.amountDueCents, 0);
  });

  it('surfaces the Square receipt url when present', () => {
    const v = visit({
      status: 'paid',
      totalCents: 5000,
      payment: {
        squareTransaction: squareTransaction({ totalCents: 5000, receiptUrl: 'https://squareup.com/receipt/abc' }),
        sessionPaymentState: null,
      },
    });
    const r = buildVisitReceipt(v, letterhead());
    assert.equal(r.payment.receiptUrl, 'https://squareup.com/receipt/abc');
  });

  it('carries the customer through untouched', () => {
    const v = visit({ customer: customer() });
    const r = buildVisitReceipt(v, letterhead());
    assert.deepEqual(r.customer, { name: 'Jane Doe', phone: '555-111-2222', email: 'jane@example.com' });
  });

  it('a repair visit gets the warranty note in the footer; a retail-only visit does not', () => {
    const repairVisit = buildVisitReceipt(visit({ devices: [device()] }), letterhead());
    const retailVisit = buildVisitReceipt(visit({ lines: [line()] }), letterhead());
    assert.match(repairVisit.footer, /warranty/i);
    assert.doesNotMatch(retailVisit.footer, /warranty/i);
  });
});

// ── renderVisitReceiptHtml ───────────────────────────────────────────────────

describe('renderVisitReceiptHtml', () => {
  it('carries zero external http(s) references — the receipt must still print with the shop offline', () => {
    const v = visit({
      subtotalCents: 4999,
      totalCents: 4999 + 13000,
      customer: customer(),
      devices: [device()],
      lines: [line()],
      // Deliberately no squareTransaction/receiptUrl here — that is a
      // legitimate customer-visible https string and belongs in its own
      // assertion below, not this one.
    });
    const html = renderVisitReceiptHtml(buildVisitReceipt(v, letterhead()));

    // The barcode <svg>'s `xmlns="http://www.w3.org/2000/svg"` is a required
    // XML namespace declaration, not a network reference — parsers never
    // fetch it. Strip it before checking for an actual resource reference, so
    // this assertion is about what the browser would try to LOAD, not every
    // occurrence of the substring "http".
    const withoutSvgNamespace = html.replace(/xmlns=(["'])http:\/\/www\.w3\.org\/2000\/svg\1/g, '');
    assert.ok(!withoutSvgNamespace.includes('http://'), 'no http:// resource reference anywhere in the page');
    assert.ok(!withoutSvgNamespace.includes('https://'), 'no https:// resource reference anywhere in the page');
    assert.ok(!html.toLowerCase().includes('cdn.tailwindcss'), 'never repeat the repair-print route\'s CDN mistake');
    assert.ok(!/<link\b/i.test(html), 'no external stylesheet link');
    assert.ok(!/<script[^>]+src=/i.test(html), 'no external script tag — only inline <script>');
    assert.ok(!/url\(\s*['"]?https?:/i.test(html), 'no CSS url(http...) reference');
    assert.ok(!/@import/i.test(html), 'no CSS @import');
  });

  it('renders the barcode as inline <svg>, not a client-side script', () => {
    const v = visit({ devices: [device()] });
    const html = renderVisitReceiptHtml(buildVisitReceipt(v, letterhead()));
    assert.match(html, /<svg[^>]*>/);
  });

  it('only auto-prints when asked — plain render has no window.print()', () => {
    const v = visit();
    const plain = renderVisitReceiptHtml(buildVisitReceipt(v, letterhead()));
    const printed = renderVisitReceiptHtml(buildVisitReceipt(v, letterhead()), { autoPrint: true });
    assert.ok(!plain.includes('window.print()'));
    assert.ok(printed.includes('window.print()'));
  });

  it('escapes an HTML-injecting customer name', () => {
    const v = visit({ customer: customer({ name: '<script>alert(1)</script>' }) });
    const html = renderVisitReceiptHtml(buildVisitReceipt(v, letterhead()));

    assert.ok(!html.includes('<script>alert(1)</script>'), 'the raw payload never reaches the page');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'it is escaped instead');
  });

  it('escapes an HTML-injecting repair title and line title', () => {
    const v = visit({
      devices: [device({ productTitle: '<img src=x onerror=alert(1)>' })],
      lines: [line({ title: '"><b>bold</b>' })],
    });
    const html = renderVisitReceiptHtml(buildVisitReceipt(v, letterhead()));

    assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
    assert.ok(!html.includes('"><b>bold</b>'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  it('shows the balance due for a partially_paid visit', () => {
    const v = visit({
      status: 'partially_paid',
      totalCents: 10000,
      payment: { squareTransaction: squareTransaction({ totalCents: 4000 }), sessionPaymentState: null },
    });
    const html = renderVisitReceiptHtml(buildVisitReceipt(v, letterhead()));
    assert.match(html, /Balance due/);
    assert.match(html, /\$60\.00/);
  });

  it('a fully paid visit shows no balance-due row', () => {
    const v = visit({
      status: 'paid',
      totalCents: 5000,
      payment: { squareTransaction: squareTransaction({ totalCents: 5000 }), sessionPaymentState: null },
    });
    const html = renderVisitReceiptHtml(buildVisitReceipt(v, letterhead()));
    assert.doesNotMatch(html, /Balance due/);
  });

  it('surfaces a present Square receipt url as visible escaped text', () => {
    const v = visit({
      status: 'paid',
      totalCents: 5000,
      payment: {
        squareTransaction: squareTransaction({ totalCents: 5000, receiptUrl: 'https://squareup.com/receipt/abc' }),
        sessionPaymentState: null,
      },
    });
    const html = renderVisitReceiptHtml(buildVisitReceipt(v, letterhead()));
    assert.ok(html.includes('https://squareup.com/receipt/abc'));
  });
});
