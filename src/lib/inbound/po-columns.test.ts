import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '@/lib/tables/import/parse-csv';
import {
  PO_PRESETS,
  detectPoPreset,
  identifyColumns,
  normalizePoHeader,
  parsePoDate,
  parsePoMoneyCents,
  poRowToDeskRow,
  withPoMapping,
} from './po-columns';

const fixture = parseCsv(readFileSync(new URL('./fixtures/goodwill-po-synthetic.csv', import.meta.url), 'utf8'));

test('header aliases bind by name — "#", "No." and "Number" are one word', () => {
  assert.equal(normalizePoHeader('Order #'), normalizePoHeader('order_number'));
  assert.equal(normalizePoHeader('Item No.'), normalizePoHeader('Item Number'));
  const rows = [{ 'Order #': 'A1', 'Item Title': 'Widget thing', Qty: '2', 'Unit Price': '$3.00', 'Tracking Number': '', Seller: 'Bob', 'Item #': 'X1' }];
  const id = identifyColumns(Object.keys(rows[0]), rows);
  assert.deepEqual(id.mapping, {
    order_number: 'Order #',
    item_title: 'Item Title',
    quantity: 'Qty',
    unit_cost: 'Unit Price',
    tracking: 'Tracking Number',
    vendor: 'Seller',
    item_id: 'Item #',
  });
  assert.ok(id.columns.every((c) => c.reason === 'header' && c.confidence === 1));
});

test('unfamiliar Goodwill headers: value shape finds order #, title, price, tracking, date and item #', () => {
  const id = identifyColumns(fixture.headers, fixture.rows, { preset: PO_PRESETS.goodwill });
  assert.equal(id.mapping.order_number, 'Purchase Ref', 'repeating id column is the order #');
  assert.equal(id.mapping.item_id, 'Lot Key', 'all-distinct id column is the item #');
  assert.equal(id.mapping.item_title, 'What I Won');
  assert.equal(id.mapping.unit_cost, 'Paid', 'first money column is the unit cost');
  assert.equal(id.mapping.tracking, 'Ship Track');
  assert.equal(id.mapping.order_date, 'When');
  assert.equal(id.mapping.shipping, undefined, 'a second money column is never guessed');
  assert.deepEqual(id.unmapped, ['S/H']);
  for (const field of ['order_number', 'item_title', 'unit_cost', 'tracking'] as const) {
    assert.equal(id.columns.find((c) => c.field === field)?.reason, 'values');
  }
  // No quantity column: the Goodwill preset says one item per row.
  assert.deepEqual(id.missingRequired, []);
  assert.ok(id.defaults.some((d) => d.field === 'quantity' && d.value === '1'));
  assert.ok(id.defaults.some((d) => d.field === 'priority' && d.value === '3'), 'Goodwill defaults to tier 3');
  assert.ok(id.defaults.some((d) => d.field === 'vendor' && d.value === 'Goodwill'));
});

test('the same file on the generic preset asks for quantity and platform instead of assuming', () => {
  const id = identifyColumns(fixture.headers, fixture.rows, { preset: PO_PRESETS.generic, platform: '' });
  assert.deepEqual(id.missingRequired, ['quantity', 'platform']);
});

test('Goodwill preset aliases bind before registry aliases and value shape', () => {
  const rows = [{ 'Order Id #': '65767176', 'Auction Title': 'Old radio receiver', 'Winning Bid': '$5.00', Handling: '$2.00' }];
  const id = identifyColumns(Object.keys(rows[0]), rows, { preset: PO_PRESETS.goodwill });
  assert.equal(id.mapping.unit_cost, 'Winning Bid');
  assert.equal(id.mapping.shipping, 'Handling');
  assert.equal(id.mapping.item_title, 'Auction Title');
  assert.equal(id.columns.find((c) => c.header === 'Winning Bid')?.reason, 'preset');
});

test('a money column equal to unit × quantity is the line total', () => {
  const rows = [
    { a: 'PO-10001', b: 'Brake lever set black', c: '2', d: '$4.00', e: '$8.00' },
    { a: 'PO-10001', b: 'Chain tool compact', c: '3', d: '$1.50', e: '$4.50' },
  ];
  const id = identifyColumns(['a', 'b', 'c', 'd', 'e'], rows, { preset: PO_PRESETS.generic, platform: 'manual' });
  assert.equal(id.mapping.quantity, 'c');
  assert.equal(id.mapping.unit_cost, 'd');
  assert.equal(id.mapping.line_total, 'e');
});

test('an operator pick overrides the identification and is labelled as theirs', () => {
  const base = identifyColumns(fixture.headers, fixture.rows, { preset: PO_PRESETS.goodwill });
  const next = withPoMapping(base, { ...base.mapping, unit_cost: undefined, shipping: 'S/H' }, { preset: PO_PRESETS.goodwill, platform: 'goodwill' });
  assert.equal(next.mapping.shipping, 'S/H');
  assert.equal(next.mapping.unit_cost, undefined);
  assert.equal(next.columns.find((c) => c.header === 'S/H')?.reason, 'operator');
  assert.equal(next.columns.find((c) => c.header === 'What I Won')?.reason, 'values', 'unchanged bindings keep their reason');
});

test('a blank cell in an existing quantity column is flagged, never guessed', () => {
  const ctx = { mapping: { order_number: 'o', item_title: 't', quantity: 'q' }, preset: PO_PRESETS.goodwill, platform: 'goodwill' };
  const { deskRow, problems } = poRowToDeskRow({ o: '1001', t: 'Speaker pair', q: '' }, 4, ctx);
  assert.equal(deskRow?.quantity, null);
  assert.deepEqual(problems, [{ row: 4, field: 'quantity', message: 'Quantity is blank' }]);

  const absent = poRowToDeskRow({ o: '1001', t: 'Speaker pair' }, 0, { ...ctx, mapping: { order_number: 'o', item_title: 't' } });
  assert.equal(absent.deskRow?.quantity, 1, 'no quantity column + Goodwill preset = one per row');
  assert.deepEqual(absent.problems, []);
});

test('row → desk row: platform stamp, tier, vendor default, cents, notes', () => {
  const id = identifyColumns(fixture.headers, fixture.rows, { preset: PO_PRESETS.goodwill });
  const ctx = { mapping: { ...id.mapping, shipping: 'S/H' }, preset: PO_PRESETS.goodwill, platform: 'goodwill' };
  const { deskRow, problems } = poRowToDeskRow(fixture.rows[0], 0, ctx);
  assert.deepEqual(problems, []);
  assert.equal(deskRow?.sourceType, 'manual');
  assert.equal(deskRow?.sourcePlatform, 'goodwill');
  assert.equal(deskRow?.priorityTier, 3);
  assert.equal(deskRow?.seller, 'Goodwill');
  assert.equal(deskRow?.unitCostCents, 1249);
  assert.equal(deskRow?.orderDate, '2026-09-14');
  assert.equal(deskRow?.lineItemId, '241550001');
  assert.equal(deskRow?.trackingNumber, '1Z999AA10123456784');
  assert.equal(deskRow?.notes, 'Shipping $9.95');
});

test('value parsers: dates and money', () => {
  assert.equal(parsePoDate('2026-09-14T10:00:00Z'), '2026-09-14');
  assert.equal(parsePoDate('9/4/26'), '2026-09-04');
  assert.equal(parsePoDate('Sep 14, 2026'), '2026-09-14');
  assert.equal(parsePoDate('2/30/2026'), null);
  assert.equal(parsePoMoneyCents('$1,234.50'), 123450);
  assert.equal(parsePoMoneyCents('USD 3'), 300);
  assert.equal(parsePoMoneyCents('-2.00'), null);
  assert.equal(parsePoMoneyCents('abc'), null);
});

// GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE row, plus a condition column.
const amazonFlatRow: Record<string, string> = {
  'Order ID': '111-7654321-1234567',
  'Order date': '2026-01-02',
  'Return request date': '2026-01-05',
  'Return request status': 'Approved',
  'Amazon RMA ID': 'amzn1.rma.v1.xyz',
  'Merchant RMA ID': '',
  'Label type': 'AmazonPrePaidLabel',
  'Label cost': '$7.25',
  'Return carrier': 'UPS',
  'Tracking ID': '1Z999AA10123456784',
  ASIN: 'B0ABC12345',
  'Merchant SKU': 'MSKU-1',
  'Item Name': 'Widget Pro',
  'Return quantity': '2',
  'Return Reason': 'CR-DEFECTIVE',
  'Order Amount': '$59.99',
  'Order quantity': '2',
  Condition: 'Used - Very Good',
};

const FBA_HEADERS = [
  'return-date',
  'order-id',
  'sku',
  'asin',
  'fnsku',
  'product-name',
  'quantity',
  'fulfillment-center-id',
  'detailed-disposition',
  'reason',
  'status',
  'license-plate-number',
  'customer-comments',
];

function amazonCtx(row: Record<string, string>) {
  const preset = PO_PRESETS.amazon_returns;
  return { mapping: identifyColumns(Object.keys(row), [row], { preset }).mapping, preset, platform: '' };
}

test('preset detection: Goodwill words, a plain file, and each report header set', () => {
  assert.equal(detectPoPreset(['Store'], [{ Store: 'Goodwill of Orange County' }]), 'goodwill');
  assert.equal(detectPoPreset(fixture.headers, fixture.rows), 'generic');
  assert.equal(detectPoPreset(Object.keys(amazonFlatRow), [amazonFlatRow]), 'amazon_returns');
  const prime = ['Order-ID', 'Order-date', 'Return-request-date', 'Return-request-status', 'Amazon-RMA-ID', 'Tracking-ID', 'ASIN', 'Merchant-SKU', 'Item-Name', 'Return-quantity', 'Return-Reason'];
  assert.equal(detectPoPreset(prime, []), 'amazon_returns');
  assert.equal(detectPoPreset(FBA_HEADERS, []), 'amazon_fba_returns');
  const ebay = ['Return ID', 'Order number', 'Item ID', 'Item title', 'Custom label', 'Quantity', 'Return reason', 'Buyer comments', 'Return opened'];
  assert.equal(detectPoPreset(ebay, []), 'ebay_returns');
});

test('Amazon returns identify by header words only — buyer order money is never the unit cost', () => {
  const id = identifyColumns(Object.keys(amazonFlatRow), [amazonFlatRow], { preset: PO_PRESETS.amazon_returns });
  assert.equal(id.mapping.unit_cost, undefined);
  assert.equal(id.mapping.line_total, undefined);
  for (const header of ['Order Amount', 'Label cost', 'Order quantity']) {
    assert.equal(id.columns.find((c) => c.header === header)?.field, null, `${header} stays unbound`);
  }
  assert.ok(id.columns.every((c) => c.reason == null || c.reason === 'preset' || c.reason === 'header'));
  assert.equal(id.mapping.order_number, 'Order ID');
  assert.equal(id.mapping.item_id, 'ASIN');
  assert.equal(id.mapping.sku, 'Merchant SKU');
  assert.equal(id.mapping.rma, 'Amazon RMA ID');
  assert.equal(id.mapping.condition, 'Condition');
  assert.deepEqual(id.missingRequired, []);
});

test('Amazon return row: line key, listing link, condition grade, catalog lookup', () => {
  const { deskRow, problems } = poRowToDeskRow(amazonFlatRow, 0, amazonCtx(amazonFlatRow));
  assert.deepEqual(problems, []);
  assert.equal(deskRow?.receivingType, 'RETURN');
  assert.equal(deskRow?.sourceType, 'amazon');
  assert.equal(deskRow?.sourcePlatform, 'amazon');
  assert.equal(deskRow?.orderId, '111-7654321-1234567');
  assert.equal(deskRow?.lineItemId, 'amzn1.rma.v1.xyz:B0ABC12345');
  assert.equal(deskRow?.listingUrl, 'https://www.amazon.com/dp/B0ABC12345');
  assert.equal(deskRow?.quantity, 2);
  assert.equal(deskRow?.unitCostCents, null);
  assert.equal(deskRow?.trackingNumber, '1Z999AA10123456784');
  assert.equal(deskRow?.carrierCode, 'UPS');
  assert.equal(deskRow?.rmaId, 'amzn1.rma.v1.xyz');
  assert.equal(deskRow?.returnReason, 'CR-DEFECTIVE');
  assert.equal(deskRow?.returnRequestDate, '2026-01-05');
  assert.equal(deskRow?.conditionGrade, 'USED_A');
  assert.equal(deskRow?.notes, null, 'condition is a grade, not a note');
  assert.deepEqual(deskRow?.catalogLookup, ['MSKU-1', 'B0ABC12345']);
  assert.equal(deskRow?.skipReason, null);
});

test('a cancelled return request is skipped with a reason, not flagged', () => {
  for (const status of ['Cancelled', 'Canceled']) {
    const row = { ...amazonFlatRow, 'Return request status': status, 'Return quantity': 'lots' };
    const { deskRow, problems } = poRowToDeskRow(row, 0, amazonCtx(row));
    assert.deepEqual(problems, []);
    assert.equal(deskRow?.skipReason, PO_PRESETS.amazon_returns.skip?.reason);
    assert.ok(deskRow?.skipReason);
  }
});

test('FBA return row: license plate is the line key; FBA facts carried', () => {
  const row: Record<string, string> = {
    'return-date': '2026-09-20T10:15:00+00:00',
    'order-id': '114-1111111-2222222',
    sku: 'FBA-SKU-1',
    asin: 'B0FBA00001',
    fnsku: 'X00FNSKU01',
    'product-name': 'Trail light',
    quantity: '1',
    'fulfillment-center-id': 'PHX7',
    'detailed-disposition': 'CUSTOMER_DAMAGED',
    reason: 'DAMAGED_BY_CARRIER',
    status: 'Unit returned to inventory',
    'license-plate-number': 'LPNRR123456789',
    'customer-comments': 'Arrived cracked',
  };
  const preset = PO_PRESETS.amazon_fba_returns;
  const mapping = identifyColumns(FBA_HEADERS, [row], { preset }).mapping;
  const { deskRow, problems } = poRowToDeskRow(row, 0, { mapping, preset, platform: '' });
  assert.deepEqual(problems, []);
  assert.equal(deskRow?.receivingType, 'RETURN');
  assert.equal(deskRow?.lineItemId, 'LPNRR123456789');
  assert.equal(deskRow?.licensePlateNumber, 'LPNRR123456789');
  assert.equal(deskRow?.fnsku, 'X00FNSKU01');
  assert.equal(deskRow?.disposition, 'CUSTOMER_DAMAGED');
  assert.equal(deskRow?.customerComment, 'Arrived cracked');
  assert.equal(deskRow?.returnRequestDate, '2026-09-20');
  assert.equal(deskRow?.returnReason, 'DAMAGED_BY_CARRIER');
  assert.equal(deskRow?.trackingNumber, null);
  assert.equal(deskRow?.listingUrl, 'https://www.amazon.com/dp/B0FBA00001');
});

test('listing serials split on comma, semicolon and pipe', () => {
  const ctx = {
    mapping: { order_number: 'o', item_title: 't', quantity: 'q', listing_serials: 's' },
    preset: PO_PRESETS.generic,
    platform: 'manual',
  };
  const { deskRow, problems } = poRowToDeskRow({ o: 'PO-1', t: 'Speaker pair', q: '4', s: 'SN1, SN2;SN3 | SN4,SN1' }, 0, ctx);
  assert.deepEqual(problems, []);
  assert.deepEqual(deskRow?.listingSerials, ['SN1', 'SN2', 'SN3', 'SN4']);
});
