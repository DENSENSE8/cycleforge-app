import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '@/lib/tables/import/parse-csv';
import type { BatchOrderOutcome } from './import-batch';
import { PO_PRESETS, identifyColumns } from './po-columns';
import { groupPoReviewOrders, poColumnsNeedingLook, poOrphanLines, poRemapColumn, poReviewOrders, poReviewStatus } from './po-csv-review';

const fixture = parseCsv(readFileSync(new URL('./fixtures/goodwill-po-synthetic.csv', import.meta.url), 'utf8'));
const identification = identifyColumns(fixture.headers, fixture.rows, { preset: PO_PRESETS.goodwill, platform: 'goodwill' });

const outcomes: BatchOrderOutcome[] = [
  { orderNumber: '99990001', rows: [0, 1], status: 'valid', change: 'new', lines: 2 },
  { orderNumber: '99990002', rows: [2], status: 'invalid', problems: ['Row 4: Unit cost "x" is not a price', 'More than 200 lines on one order'] },
  { orderNumber: '99990003', rows: [3], status: 'unchanged', change: 'unchanged', lines: 1 },
];

test('each order card carries its date, full titles, units and total from the file rows', () => {
  const [first] = poReviewOrders({ rows: fixture.rows, mapping: identification.mapping, platform: 'goodwill', preset: 'goodwill', outcomes, rowProblems: [] });
  assert.equal(first.orderNumber, '99990001');
  assert.equal(first.status, 'new');
  assert.equal(first.orderDate, '2026-09-14');
  assert.equal(first.lines[0].title, 'SYNTHETIC Vintage Sony Walkman WM-2 cassette player parts');
  assert.equal(first.lines[0].itemNumber, '241550001');
  assert.equal(first.units, 2);
  assert.equal(first.totalCents, 1249 + 1800);
});

test('row problems land on their line; problems naming no row stay on the order', () => {
  const orders = poReviewOrders({
    rows: fixture.rows,
    mapping: identification.mapping,
    platform: 'goodwill',
    preset: 'goodwill',
    outcomes,
    rowProblems: [{ row: 2, field: 'unit_cost', message: 'Unit cost "x" is not a price' }],
  });
  assert.equal(orders[1].status, 'needs_fix');
  assert.deepEqual(orders[1].lines[0].problems.map((p) => p.field), ['unit_cost']);
  assert.deepEqual(orders[1].orderProblems, ['More than 200 lines on one order']);
});

test('groups put what needs a fix first and drop empty groups', () => {
  const orders = poReviewOrders({ rows: fixture.rows, mapping: identification.mapping, platform: 'goodwill', preset: 'goodwill', outcomes, rowProblems: [] });
  assert.deepEqual(groupPoReviewOrders(orders).map((g) => g.status), ['needs_fix', 'new', 'unchanged']);
});

test('statuses read the writer outcome — landed orders keep their change', () => {
  assert.equal(poReviewStatus({ status: 'landed', change: 'updated' }), 'updated');
  assert.equal(poReviewStatus({ status: 'failed', change: undefined }), 'failed');
});

test('rows with no order number come back on their own', () => {
  const lines = poOrphanLines({
    rows: [{ ...fixture.rows[0], 'Purchase Ref': '' }],
    mapping: identification.mapping,
    platform: 'goodwill',
    preset: 'goodwill',
    rowProblems: [{ row: 0, field: 'order_number', message: 'Order # is blank' }],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].title, 'SYNTHETIC Vintage Sony Walkman WM-2 cassette player parts');
});

test('only unmatched or weakly guessed columns ask for a look, until checked', () => {
  const look = poColumnsNeedingLook(identification, new Set()).map((c) => c.header);
  assert.deepEqual(look, ['Lot Key', 'Paid', 'S/H']);
  assert.deepEqual(poColumnsNeedingLook(identification, new Set(['S/H', 'Paid', 'Lot Key'])), []);
});

test('a column picks one field — it leaves its old field, the field leaves its old column', () => {
  const mapping = { order_number: 'Purchase Ref', unit_cost: 'Paid', shipping: 'S/H' } as const;
  assert.deepEqual(poRemapColumn(mapping, 'S/H', 'unit_cost'), { order_number: 'Purchase Ref', unit_cost: 'S/H' });
  assert.deepEqual(poRemapColumn(mapping, 'Paid', ''), { order_number: 'Purchase Ref', shipping: 'S/H' });
});
