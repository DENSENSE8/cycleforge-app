import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  ORDER_EXPORT_COLUMNS,
  buildOrderExportCsv,
  buildOrderExportRow,
  orderExportFilename,
} from './order-export-csv';

test('header is the full column list, even for an empty selection', () => {
  assert.equal(buildOrderExportCsv([]), ORDER_EXPORT_COLUMNS.join(','));
});

test('a row maps onto the lane the operator can see', () => {
  const row = buildOrderExportRow({
    id: 42,
    order_id: '112-3456789-0001234',
    product_title: 'Bose SoundLink Mini II',
    sku: 'BOSE-SLM2-BK',
    condition: 'USED_GOOD',
    quantity: '2',
    ship_by_date: '2026-08-03',
    shipping_tracking_number: '9400100000000000000199',
    serial_number: 'SN-1',
    account_source: null,
    is_urgent: true,
    is_out_of_stock: false,
  });

  assert.deepEqual(row, [
    '112-3456789-0001234',
    'Bose SoundLink Mini II',
    'BOSE-SLM2-BK',
    'USED_GOOD',
    '2',
    '2026-08-03',
    '9400100000000000000199',
    'SN-1',
    // Runtime platform label from the SoT, not a hardcoded vendor string.
    'Amazon',
    'true',
    'false',
    '42',
  ]);
  assert.equal(row.length, ORDER_EXPORT_COLUMNS.length);
});

test('ship_by falls back to deadline_at, tracking to tracking_number', () => {
  const row = buildOrderExportRow({
    order_id: 'A-1',
    deadline_at: '2026-08-09',
    tracking_number: 'TRK-9',
  });
  assert.equal(row[ORDER_EXPORT_COLUMNS.indexOf('ship_by')], '2026-08-09');
  assert.equal(row[ORDER_EXPORT_COLUMNS.indexOf('tracking')], 'TRK-9');
});

test('missing facts are empty cells, never "N/A"', () => {
  const row = buildOrderExportRow({ order_id: 'A-1' });
  assert.ok(!row.includes('N/A'));
  assert.equal(row[ORDER_EXPORT_COLUMNS.indexOf('product_title')], '');
  assert.equal(row[ORDER_EXPORT_COLUMNS.indexOf('record_id')], '');
  // Absent flags read false, not blank — a blank would be ambiguous with "unknown".
  assert.equal(row[ORDER_EXPORT_COLUMNS.indexOf('is_urgent')], 'false');
});

test('commas, quotes and newlines in a title survive the round trip', () => {
  const csv = buildOrderExportCsv([
    { order_id: 'A-1', product_title: 'Speaker, 2" driver\nrefurb "B" grade' },
  ]);
  const body = csv.split('\n').slice(1).join('\n');
  assert.ok(body.startsWith('A-1,"Speaker, 2"" driver'));
  assert.ok(body.includes('refurb ""B"" grade"'));
  // One header line + one quoted field containing an embedded newline.
  assert.equal(csv.split('"').length % 2, 1);
});

test('filename carries the lane and the warehouse civil day', () => {
  assert.equal(orderExportFilename('pending', '2026-07-31'), 'pending-orders-2026-07-31.csv');
  assert.match(orderExportFilename('pending'), /^pending-orders-\d{4}-\d{2}-\d{2}\.csv$/);
});
