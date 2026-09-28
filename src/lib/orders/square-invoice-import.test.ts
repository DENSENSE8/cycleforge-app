/**
 * Square invoice import — an invoice + its Square order + catalog variations
 * become the intake prefill: variation titles, shipment address over the
 * invoice recipient's, SKUs from the catalog, drafts / cancelled skipped.
 * Run: npx tsx --test src/lib/orders/square-invoice-import.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapSquareInvoices,
  paymentLinesForImport,
  squarePaymentFacts,
  squareTenderFacts,
  type ImportedIndex,
  type SquareInvoice,
  type SquareOrder,
} from './square-invoice-import-core';

const none: ImportedIndex = { byInvoiceId: new Map(), byOrderNumber: new Set() };

const invoice = (over: Partial<SquareInvoice> = {}): SquareInvoice => ({
  id: 'inv_1',
  version: 3,
  invoice_number: '000101',
  status: 'UNPAID',
  title: 'Speaker brackets',
  created_at: '2026-09-20T17:00:00Z',
  order_id: 'ord_1',
  primary_recipient: {
    customer_id: 'cust_1',
    given_name: 'Ada',
    family_name: 'Lovelace',
    email_address: 'ada@example.com',
    phone_number: '+15551230000',
    address: { address_line_1: '1 Billing St', locality: 'Austin', administrative_district_level_1: 'TX', postal_code: '73301', country: 'US' },
  },
  payment_requests: [
    { computed_amount_money: { amount: 5000, currency: 'USD' }, total_completed_amount_money: { amount: 1000, currency: 'USD' } },
    { computed_amount_money: { amount: 2850, currency: 'USD' } },
  ],
  ...over,
});

const order = (over: Partial<SquareOrder> = {}): SquareOrder => ({
  id: 'ord_1',
  line_items: [
    { name: 'Bose 151 bracket', variation_name: 'Black', quantity: '2', base_price_money: { amount: 3900 }, catalog_object_id: 'var_black' },
    { name: 'Shipping insurance', variation_name: 'Regular', quantity: '1', base_price_money: { amount: 50 }, catalog_object_id: 'var_none', note: 'fragile' },
    { name: 'Custom labour', quantity: '1' },
  ],
  fulfillments: [
    { type: 'PICKUP' },
    {
      type: 'SHIPMENT',
      shipment_details: {
        recipient: {
          display_name: 'Ada at the shop',
          address: { address_line_1: '9 Ship Rd', address_line_2: 'Unit 4', locality: 'Dallas', administrative_district_level_1: 'TX', postal_code: '75001', country: 'US' },
        },
      },
    },
  ],
  ...over,
});

const catalog = [
  { id: 'var_black', type: 'ITEM_VARIATION', item_variation_data: { sku: 'BOSE-151-BLK' } },
  { id: 'var_none', type: 'ITEM_VARIATION', item_variation_data: {} },
];

test('maps lines: variation joined unless "Regular", integer qty, sku from catalog, null when absent', () => {
  const [imp] = mapSquareInvoices({ invoices: [invoice()], orders: [order()], catalog, imported: none, defaultCurrency: 'USD' });
  assert.deepEqual(imp.lines, [
    { title: 'Bose 151 bracket — Black', quantity: 2, unitCents: 3900, sku: 'BOSE-151-BLK', note: null },
    { title: 'Shipping insurance', quantity: 1, unitCents: 50, sku: null, note: 'fragile' },
    { title: 'Custom labour', quantity: 1, unitCents: null, sku: null, note: null },
  ]);
  assert.deepEqual(paymentLinesForImport(imp).map((l) => [l.sku, l.qty, l.unitPriceCents, l.lineCents]), [
    ['BOSE-151-BLK', 2, 3900, 7800],
    [null, 1, 50, 50],
    [null, 1, 0, 0],
  ]);
});

test('money sums payment requests in integer cents; order number proposed from invoice_number', () => {
  const [imp] = mapSquareInvoices({ invoices: [invoice()], orders: [order()], catalog, imported: none, defaultCurrency: 'CAD' });
  assert.equal(imp.totalCents, 7850);
  assert.equal(imp.paidCents, 1000);
  assert.equal(imp.currency, 'USD');
  assert.equal(imp.orderNumber, 'SQ-INV-000101');
  assert.equal(imp.status, 'UNPAID');
  assert.equal(imp.importedAs, null);
});

test('ship-to prefers the SHIPMENT fulfillment recipient; name/email/phone from the invoice recipient', () => {
  const [imp] = mapSquareInvoices({ invoices: [invoice()], orders: [order()], catalog, imported: none, defaultCurrency: 'USD' });
  assert.deepEqual(imp.customer, {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+15551230000',
    shipTo: { address1: '9 Ship Rd', address2: 'Unit 4', city: 'Dallas', state: 'TX', postalCode: '75001', country: 'US' },
  });
});

test('no shipment → invoice recipient address; no recipient name → fulfillment display_name', () => {
  const noShip = mapSquareInvoices({
    invoices: [invoice()], orders: [order({ fulfillments: [] })], catalog, imported: none, defaultCurrency: 'USD',
  })[0];
  assert.equal(noShip.customer.shipTo.address1, '1 Billing St');
  assert.equal(noShip.customer.shipTo.city, 'Austin');

  const unnamed = mapSquareInvoices({
    invoices: [invoice({ primary_recipient: { email_address: 'x@example.com' } })], orders: [order()], catalog, imported: none, defaultCurrency: 'USD',
  })[0];
  assert.equal(unnamed.customer.name, 'Ada at the shop');
  assert.equal(unnamed.customer.shipTo.address1, '9 Ship Rd');
});

test('skips DRAFT and CANCELED, keeps order, marks what already lives in CycleForge', () => {
  const invoices = [
    invoice({ id: 'inv_draft', status: 'DRAFT' }),
    invoice({ id: 'inv_paid', invoice_number: '000100', status: 'PAID' }),
    invoice({ id: 'inv_cancel', status: 'CANCELED' }),
    invoice({ id: 'inv_open', invoice_number: '000099', status: 'SCHEDULED', order_id: 'missing' }),
    invoice({ id: 'inv_rail', invoice_number: 'PH-000123', status: 'PARTIALLY_PAID' }),
  ];
  const imported: ImportedIndex = { byInvoiceId: new Map([['inv_rail', 'PH-000123']]), byOrderNumber: new Set(['SQ-INV-000100']) };
  const out = mapSquareInvoices({ invoices, orders: [order()], catalog, imported, defaultCurrency: 'USD' });
  assert.deepEqual(out.map((i) => [i.invoiceId, i.importedAs]), [
    ['inv_paid', 'SQ-INV-000100'],
    ['inv_open', null],
    ['inv_rail', 'PH-000123'],
  ]);
  assert.deepEqual(out[1].lines, [], 'an invoice whose order was not retrieved has no lines');
});

test('walk-in: no usable ship-to anywhere → hasShipTo false; a complete shipment address → true', () => {
  const walkIn = mapSquareInvoices({
    invoices: [invoice({ primary_recipient: { given_name: 'Walk', family_name: 'In' } })],
    orders: [order({ fulfillments: [] })], catalog, imported: none, defaultCurrency: 'USD',
  })[0];
  assert.equal(walkIn.hasShipTo, false);
  assert.equal(mapSquareInvoices({ invoices: [invoice()], orders: [order()], catalog, imported: none, defaultCurrency: 'USD' })[0].hasShipTo, true);
});

test('a paid invoice reads brand / last 4 / entry method off the order tender — nothing else about the card', () => {
  const paidOrder = order({
    tenders: [
      { id: 't_dead', type: 'CARD', payment_id: 'pay_dead', card_details: { status: 'FAILED', card: { card_brand: 'MASTERCARD', last_4: '5454' }, entry_method: 'SWIPED' } },
      { id: 't_live', type: 'CARD', payment_id: 'pay_live', card_details: { status: 'CAPTURED', card: { card_brand: 'VISA', last_4: '4242' }, entry_method: 'CONTACTLESS' } },
    ],
  });
  const [imp] = mapSquareInvoices({ invoices: [invoice({ status: 'PAID' })], orders: [paidOrder], catalog, imported: none, defaultCurrency: 'USD' });
  assert.deepEqual(imp.payment, {
    paymentId: 'pay_live', tender: 'card', cardBrand: 'visa', cardLast4: '4242', entryMethod: 'tap', authCode: null, receiptUrl: null,
  });

  const unpaid = mapSquareInvoices({
    invoices: [invoice({ payment_requests: [{ computed_amount_money: { amount: 100, currency: 'USD' } }] })],
    orders: [paidOrder], catalog, imported: none, defaultCurrency: 'USD',
  })[0];
  assert.equal(unpaid.payment, null, 'nothing collected → no tender facts');
});

test('tender mapping: cash, unknown brand, malformed last 4, EMV → chip', () => {
  assert.equal(squareTenderFacts(order({ tenders: [{ id: 't', type: 'CASH' }] }))?.tender, 'cash');
  assert.equal(squareTenderFacts(order({ tenders: [] })), null);
  const odd = squareTenderFacts(order({ tenders: [{ id: 't', type: 'CARD', card_details: { card: { card_brand: 'FELICA', last_4: '12' }, entry_method: 'EMV' } }] }));
  assert.deepEqual([odd?.cardBrand, odd?.cardLast4, odd?.entryMethod, odd?.paymentId], ['other', null, 'chip', 't']);
});

test('Payments API read-back keeps the receipt + auth code and drops expiry / BIN / fingerprint', () => {
  const payment = {
    id: 'pay_1',
    status: 'COMPLETED',
    source_type: 'CARD',
    receipt_url: 'https://squareup.com/receipt/preview/pay_1',
    card_details: {
      status: 'CAPTURED',
      entry_method: 'KEYED',
      auth_result_code: 'a1B2c3',
      card: { card_brand: 'AMERICAN_EXPRESS', last_4: '0005', exp_month: 12, exp_year: 2030, bin: '378282', fingerprint: 'sq-1-xyz' },
    },
  };
  const facts = squarePaymentFacts(payment);
  assert.deepEqual(facts, {
    paymentId: 'pay_1', tender: 'card', cardBrand: 'amex', cardLast4: '0005', entryMethod: 'keyed', authCode: 'a1B2c3',
    receiptUrl: 'https://squareup.com/receipt/preview/pay_1',
  });
  const wire = JSON.stringify(facts);
  for (const leaked of ['2030', '378282', 'fingerprint', 'exp_']) assert.ok(!wire.includes(leaked), leaked);

  const hostile = squarePaymentFacts({ ...payment, receipt_url: 'javascript:alert(1)', card_details: { ...payment.card_details, auth_result_code: '4111111111111111' } });
  assert.equal(hostile?.receiptUrl, null);
  assert.equal(hostile?.authCode, null, 'a PAN-shaped auth code is dropped');
  assert.equal(squarePaymentFacts({ id: 'p', source_type: 'CASH' })?.tender, 'cash');
});
