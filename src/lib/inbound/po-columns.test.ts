import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '@/lib/tables/import/parse-csv';
import {
  PO_PRESETS,
  identifyColumns,
  normalizePoHeader,
  parsePoDate,
  parsePoMoneyCents,
  poRowToDeskRow,
  suggestPoPlatform,
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

test('platform suggestion sees Goodwill in cells', () => {
  assert.equal(suggestPoPlatform(['Store'], [{ Store: 'Goodwill of Orange County' }]), 'goodwill');
  assert.equal(suggestPoPlatform(fixture.headers, fixture.rows), '');
});
