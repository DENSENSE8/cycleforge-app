import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  buildPriceBreakdown,
  getOrderPriceBreakdown,
  type OrderPriceBreakdownDeps,
  type PriceBreakdownInput,
  type PriceLabelInput,
} from './order-price-breakdown';

/**
 * DB-free: the Selected-order Price panel's math — cents rounding, labels by
 * purpose, and what the net does when an input is missing.
 * Run: node --require ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/orders/order-price-breakdown.test.ts
 */

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

function label(over: Partial<PriceLabelInput> = {}): PriceLabelInput {
  return {
    id: 1,
    purpose: 'outbound',
    creationType: 'imported_shipstation',
    status: 'purchased',
    trackingNumber: '9400',
    carrierCode: 'stamps_com',
    cost: 5.1,
    insuranceCost: null,
    ...over,
  };
}

function input(over: Partial<PriceBreakdownInput> = {}): PriceBreakdownInput {
  return {
    shipstation: {
      orderNumber: 'A-1',
      orderTotal: 64.97,
      amountPaid: 64.97,
      taxAmount: 4.2,
      shippingAmount: 5.99,
      lineItems: [
        { sku: 'W-1', name: 'Widget', quantity: 3, unitPrice: 0.1 },
        { sku: 'G-2', name: 'Gadget', quantity: 1, unitPrice: 54.48 },
      ],
    },
    rowSaleAmount: null,
    labels: [],
    ...over,
  };
}

test('items: qty × unit price in cents — 3 × 0.10 is 0.30, never 0.30000000000000004', () => {
  const b = buildPriceBreakdown(input());
  assert.deepEqual(b.lines.map((l) => l.total), [0.3, 54.48]);
  assert.equal(b.itemSubtotal, 54.78);
  assert.equal(b.shippingCharged, 5.99);
  assert.equal(b.tax, 4.2);
  assert.equal(b.source, 'shipstation');
});

test('labels: costs split by purpose (insurance included); voided and pending labels cost nothing', () => {
  const b = buildPriceBreakdown(
    input({
      labels: [
        label({ id: 1, purpose: 'outbound', cost: 5.1, insuranceCost: 1.05 }),
        label({ id: 2, purpose: 'return', cost: 7.33 }),
        label({ id: 3, purpose: 'replacement', cost: 4.2 }),
        label({ id: 4, purpose: 'replacement', cost: 4.2, status: 'voided' }),
        label({ id: 5, purpose: 'outbound', cost: null, status: 'pending' }),
      ],
    }),
  );
  assert.deepEqual(b.labelCostByPurpose, { outbound: 6.15, return: 7.33, replacement: 4.2 });
  assert.equal(b.labelCostTotal, 17.68);
  assert.deepEqual(b.labels.map((l) => [l.id, l.total]), [[1, 6.15], [2, 7.33], [3, 4.2]]);
  // net = paid − tax − labels = 64.97 − 4.20 − 17.68
  assert.equal(b.net, 43.09);
  assert.equal(b.netBasis, 'amount_paid');
  assert.equal(b.incomplete, false);
});

test('net: an unknown label cost is flagged, not guessed as zero silently', () => {
  const b = buildPriceBreakdown(input({ labels: [label({ cost: 5 }), label({ id: 2, purpose: 'return', cost: null })] }));
  assert.equal(b.net, 55.77);
  assert.equal(b.incomplete, true);
  assert.deepEqual(b.gaps, ['1 label with no known cost']);
  assert.deepEqual(b.labelCostByPurpose, { outbound: 5 });
});

test('net: amount paid missing falls back to the order total and says so; tax missing is flagged', () => {
  const b = buildPriceBreakdown(
    input({
      shipstation: { orderNumber: 'A-1', orderTotal: 20, amountPaid: null, taxAmount: null, shippingAmount: null, lineItems: [] },
    }),
  );
  assert.equal(b.net, 20);
  assert.equal(b.netBasis, 'order_total');
  assert.equal(b.incomplete, true);
  assert.deepEqual(b.gaps, ['amount paid unknown — net starts from the order total', 'tax unknown — not deducted']);
  assert.equal(b.itemSubtotal, null);
});

test('items: adjustment lines sit apart from the subtotal; an unpriced line is a gap', () => {
  const b = buildPriceBreakdown(
    input({
      shipstation: {
        orderNumber: 'A-1',
        orderTotal: 10,
        amountPaid: 10,
        taxAmount: 0,
        shippingAmount: 0,
        lineItems: [
          { sku: 'W-1', quantity: 2, unitPrice: 6 },
          { name: 'Discount', quantity: 1, unitPrice: -2, adjustment: true },
          { sku: 'FREEBIE', quantity: 1, unitPrice: null },
        ],
      },
    }),
  );
  assert.equal(b.itemSubtotal, 12);
  assert.equal(b.adjustments, -2);
  assert.equal(b.lines.length, 2);
  assert.equal(b.lines[1]!.total, null);
  assert.deepEqual(b.gaps, ['1 item line without a unit price']);
});

test('not a ShipStation order: the row sale amount starts the net, labelled as such', () => {
  const b = buildPriceBreakdown({ shipstation: null, rowSaleAmount: 30, labels: [label({ cost: 4.5 })] });
  assert.equal(b.source, 'order_row');
  assert.equal(b.saleAmount, 30);
  assert.equal(b.net, 25.5);
  assert.equal(b.netBasis, 'sale_amount');
  const none = buildPriceBreakdown({ shipstation: null, rowSaleAmount: null, labels: [] });
  assert.equal(none.source, 'none');
  assert.equal(none.net, null);
});

test('read: persisted ShipStation amounts (numeric as text) and labels reach the math; a foreign order is null', async () => {
  const calls: Array<[string, number]> = [];
  const deps: OrderPriceBreakdownDeps = {
    readOrder: async (org, id) => {
      calls.push(['order', id]);
      assert.equal(org, ORG);
      return id === 7
        ? {
            sale_amount: '99.00',
            ss_order_number: 'SS-7',
            order_total: '25.00',
            amount_paid: '25.00',
            tax_amount: '1.50',
            shipping_amount: '3.00',
            line_items: [{ sku: 'X', name: 'X', quantity: 2, unitPrice: 10.25, lineItemKey: 'k' }],
          }
        : null;
    },
    readLabels: async (_org, id) => {
      calls.push(['labels', id]);
      return [{ id: '3', purpose: 'return', creation_type: 'linked_manually', status: 'purchased', tracking_number: 'T', carrier_code: 'ups', cost: '6.40', insurance_cost: null }];
    },
  };
  const b = await getOrderPriceBreakdown(ORG, 7, deps);
  assert.equal(b?.shipstationOrderNumber, 'SS-7');
  assert.equal(b?.itemSubtotal, 20.5);
  assert.equal(b?.saleAmount, null);
  assert.deepEqual(b?.labelCostByPurpose, { return: 6.4 });
  assert.equal(b?.net, 17.1);
  assert.equal(await getOrderPriceBreakdown(ORG, 8, deps), null);
  assert.deepEqual(calls, [['order', 7], ['labels', 7], ['order', 8], ['labels', 8]]);
});
