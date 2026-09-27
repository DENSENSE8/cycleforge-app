import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  ORDER_EXPORT_COLUMNS,
  PACKED_EXPORT_COLUMNS,
  buildOrderExportCsv,
  buildOrderExportRow,
  formatExportDateTime24h,
  buildPackedOrderExportCsv,
  buildPackedOrderExportRow,
  formatExportCivilDate,
  formatExportDateTime24h,
  orderExportFilename,
  packedExportRangeLabel,
  packedOrderExportFilename,
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
    // The lifecycle story the export exists to carry (2026-08-31): who did each
    // step, when, what the order was worth, and the stage those add up to.
    sale_amount: '129.5',
    has_pick_scan: true,
    picked_by_name: 'Tuan',
    picked_at: '2026-08-01T17:04:00.000Z',
    packed_by_name: 'Sam',
    packed_at: '2026-08-02T18:30:00.000Z',
    shipped_out_by_name: 'Rae',
    ship_confirmed_at: '2026-08-03T20:15:00.000Z',
    shipment_id: 77,
  });

  assert.deepEqual(row, [
    '112-3456789-0001234',
    'Bose SoundLink Mini II',
    'BOSE-SLM2-BK',
    'USED_GOOD',
    '2',
    // Two decimals always — a money column a spreadsheet can sum.
    '129.50',
    // The lifecycle SoT's own vocabulary — packed WITH a label staged.
    'PACKED_STAGED',
    'Tuan',
    formatExportDateTime24h('2026-08-01T17:04:00.000Z'),
    'Sam',
    formatExportDateTime24h('2026-08-02T18:30:00.000Z'),
    'Rae',
    formatExportDateTime24h('2026-08-03T20:15:00.000Z'),
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

test('packed export uses staff columns, 24h stamps, and the selected window', () => {
  const window = { dateFrom: '2026-08-21', dateTo: '2026-08-27' };
  assert.equal(packedExportRangeLabel(window), '08/21/26 – 08/27/26');
  assert.equal(formatExportCivilDate('2026-08-27'), '08/27/26');
  assert.equal(formatExportDateTime24h('2026-08-27 16:05:00'), '08/27/26 16:05');
  assert.equal(packedOrderExportFilename(window), 'packed-orders-08-21-26-to-08-27-26.csv');
  assert.equal(
    packedOrderExportFilename({ dateFrom: '2026-08-27', dateTo: '2026-08-27' }),
    'packed-orders-08-27-26.csv',
  );
  assert.equal(packedOrderExportFilename({}), 'packed-orders-all-dates.csv');

  const row = buildPackedOrderExportRow(
    {
      id: 7,
      order_id: 'A-1',
      product_title: 'Bose SoundLink Mini II',
      sku: 'BOSE-SLM2-BK',
      condition: 'USED_A',
      quantity: '1',
      ship_by_date: '2026-08-28',
      packed_at: '2026-08-27 16:05:00',
      packed_by_name: 'Ada',
      shipment_id: 99,
    },
    window,
  );
  assert.equal(row.length, PACKED_EXPORT_COLUMNS.length);
  assert.deepEqual(row, [
    '08/21/26 – 08/27/26',
    '08/27/26 16:05',
    'Ada',
    'A-1',
    'Bose SoundLink Mini II',
    'BOSE-SLM2-BK',
    'Used — A',
    '1',
    '08/28/26',
    '',
    '',
    '',
  ]);
  assert.ok(!row.includes('7'));
  assert.ok(!row.includes('99'));
  assert.ok(!row.includes('USED_A'));

  const csv = buildPackedOrderExportCsv(
    [{ order_id: 'A-1', packed_at: '2026-08-27 16:05:00', packed_by_name: 'Ada' }],
    window,
  );
  assert.ok(csv.startsWith(PACKED_EXPORT_COLUMNS.join(',')));
  assert.ok(csv.includes('08/21/26 – 08/27/26'));
  assert.ok(csv.includes('08/27/26 16:05'));
  assert.ok(!csv.includes('record_id'));
  assert.ok(!csv.includes('shipment_id'));
});
