import test from 'node:test';
import assert from 'node:assert/strict';
import type { PackerRecord } from '@/hooks/usePackerLogs';
import { dedupeShippedRecords, deriveShippedRecord, isShippedDeskRow, shippedRecordTimestamp } from './shipped-records';

function row(over: Partial<PackerRecord> & Pick<PackerRecord, 'id'>): PackerRecord {
  return {
    created_at: '2026-08-28 16:00:00',
    scan_ref: null,
    shipping_tracking_number: '',
    packed_by: 4,
    tracking_type: 'ORDERS',
    order_id: 'FBA19JY9D8PV',
    account_source: null,
    product_title: null,
    condition: null,
    sku: null,
    packer_photos_url: [],
    ...over,
  };
}

test('a multi-box order stays one row per box even though every box carries the order primary shipment_id', () => {
  const out = dedupeShippedRecords([
    row({ id: 1, shipment_id: 43308, package_shipment_id: 43308 }),
    row({ id: 2, shipment_id: 43308, package_shipment_id: 43309 }),
    row({ id: 3, shipment_id: 43308, package_shipment_id: 43311 }),
  ]);

  assert.deepEqual(out.map((r) => r.package_shipment_id).sort(), [43308, 43309, 43311]);
});

test('re-scans of the same box collapse to the newest scan', () => {
  const out = dedupeShippedRecords([
    row({ id: 9, package_shipment_id: 52848, packed_by: 4 }),
    row({ id: 3, package_shipment_id: 52848, packed_by: 2 }),
  ]);

  assert.deepEqual(out.map((r) => r.id), [9]);
});

test('rows with no package fall back to the order number, then the scanned reference', () => {
  const out = dedupeShippedRecords([
    row({ id: 1, package_shipment_id: null, order_id: 'A-1' }),
    row({ id: 2, package_shipment_id: null, order_id: 'A-1' }),
    row({ id: 3, package_shipment_id: null, order_id: null, scan_ref: 'X00ABC' }),
    row({ id: 4, package_shipment_id: null, order_id: null, scan_ref: 'X00DEF' }),
  ]);

  assert.deepEqual(out.map((r) => r.id).sort(), [2, 3, 4]);
});

test('carrier delivery promotes a packed row into Shipped and overrides scan-out', () => {
  const delivered = row({
    id: 12,
    ship_confirmed_at: null,
    shipped_out_by: null,
    latest_status_category: 'DELIVERED',
    is_terminal: true,
  });

  assert.equal(isShippedDeskRow(delivered), true);
  assert.equal(deriveShippedRecord(delivered).outboundState, 'DELIVERED');
});

test('packed with no dock or carrier custody remains outside Shipped', () => {
  assert.equal(isShippedDeskRow(row({ id: 13, ship_confirmed_at: null, shipped_out_by: null })), false);
});

test('the dock handoff timestamp places a packed row in a Shipped period', () => {
  assert.equal(
    shippedRecordTimestamp(row({
      id: 14,
      created_at: '2026-01-10 08:00:00',
      ship_confirmed_at: '2026-09-30 14:00:00',
      shipped_out_by: 1,
    })),
    '2026-09-30 14:00:00',
  );
});
