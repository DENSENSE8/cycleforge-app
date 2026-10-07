import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  knownShipStationTotal,
  marketplaceOrderTotalSql,
  orderTotalSourceLabel,
  resolveOrderTotal,
  type OrderTotalInput,
} from './order-total';

const NOTHING: OrderTotalInput = {
  shipstationTotal: null,
  shipstationPriced: false,
  marketplaceTotal: null,
  lineTotalSum: null,
  pricedLines: 0,
  lines: 1,
};

test('ShipStation wins over the marketplace total and the line sum', () => {
  // The ShipStation total carries shipping and tax; the line sum is items only.
  assert.deepEqual(
    resolveOrderTotal({ ...NOTHING, shipstationTotal: 52.13, shipstationPriced: true, marketplaceTotal: 50, lineTotalSum: 45, pricedLines: 1 }),
    { amount: 52.13, source: 'shipstation' },
  );
});

test('a ShipStation 0 with no priced item is unknown, not free', () => {
  assert.deepEqual(resolveOrderTotal({ ...NOTHING, shipstationTotal: 0, lineTotalSum: 838, pricedLines: 1 }), {
    amount: 838,
    source: 'lines',
  });
  assert.equal(resolveOrderTotal({ ...NOTHING, shipstationTotal: 0 }), null);
  // A priced order that ShipStation totals at 0 is a real 0.
  assert.deepEqual(resolveOrderTotal({ ...NOTHING, shipstationTotal: 0, shipstationPriced: true }), {
    amount: 0,
    source: 'shipstation',
  });
});

test('the marketplace total wins over the line sum', () => {
  assert.deepEqual(resolveOrderTotal({ ...NOTHING, marketplaceTotal: 64.2, lineTotalSum: 59.99, pricedLines: 1 }), {
    amount: 64.2,
    source: 'marketplace',
  });
});

test('the line sum counts only when every line is priced', () => {
  assert.deepEqual(resolveOrderTotal({ ...NOTHING, lineTotalSum: 30, pricedLines: 2, lines: 2 }), { amount: 30, source: 'lines' });
  // One unpriced line of two: a partial sum would read as the whole order.
  assert.equal(resolveOrderTotal({ ...NOTHING, lineTotalSum: 20, pricedLines: 1, lines: 2 }), null);
  assert.equal(resolveOrderTotal({ ...NOTHING, lines: 0, pricedLines: 0, lineTotalSum: 0 }), null);
  // A $0.00 line is a price.
  assert.deepEqual(resolveOrderTotal({ ...NOTHING, lineTotalSum: 0, pricedLines: 1 }), { amount: 0, source: 'lines' });
});

test('a non-finite amount is no amount', () => {
  assert.equal(knownShipStationTotal(Number.NaN, true), null);
  assert.equal(resolveOrderTotal({ ...NOTHING, marketplaceTotal: Number.POSITIVE_INFINITY }), null);
});

test('each source has a hover label; the marketplace one names the platform', () => {
  assert.equal(orderTotalSourceLabel('shipstation', 'Amazon'), 'ShipStation order total');
  assert.equal(orderTotalSourceLabel('marketplace', 'Shopify'), 'Shopify order total');
  assert.equal(orderTotalSourceLabel('marketplace', ' '), 'Marketplace order total');
  assert.equal(orderTotalSourceLabel('lines', 'eBay'), 'Sum of line totals');
});

test('the SQL face reads sale_amount only for whole-order importers', () => {
  assert.equal(marketplaceOrderTotalSql('o'), "CASE WHEN o.account_source IN ('shopify', 'square') THEN o.sale_amount END");
});
