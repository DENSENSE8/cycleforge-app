import test from 'node:test';
import assert from 'node:assert/strict';
import type { PackerRecord } from '@/hooks/usePackerLogs';
import { dedupeShippedRecords } from './shipped-records';

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
