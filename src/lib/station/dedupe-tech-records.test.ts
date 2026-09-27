import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TechRecord } from '@/hooks/useDeskPickLogs';
import { dedupeTechRecords, getTechRecordRowKey } from '@/lib/station/dedupe-tech-records';
import {
  techRecordRailId,
  techRecordToPreviewOrder,
} from '@/components/sidebar/shipping/shipping-rail-shared';

function baseRecord(overrides: Partial<TechRecord> = {}): TechRecord {
  return {
    id: 1,
    created_at: '2026-07-15T12:00:00Z',
    shipping_tracking_number: '1Z999',
    serial_number: '',
    tested_by: 7,
    order_id: 'ORD-100',
    product_title: 'Widget',
    condition: 'Used',
    sku: 'SKU-1',
    ...overrides,
  };
}

describe('dedupeTechRecords', () => {
  it('merges duplicate tracking keys preferring rows with serials', () => {
    const stub = baseRecord({
      id: 10,
      source_kind: 'tech_scan',
      source_row_id: 10,
      serial_number: '',
      product_title: 'Unknown Product',
      created_at: '2026-07-15T13:00:00Z',
    });
    const serial = baseRecord({
      id: 11,
      source_kind: 'tech_serial',
      source_row_id: 11,
      serial_number: 'SN-ABC',
      product_title: 'Widget Pro',
      created_at: '2026-07-15T12:00:00Z',
    });
    const merged = dedupeTechRecords([stub, serial]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.serial_number, 'SN-ABC');
    assert.equal(merged[0]?.product_title, 'Widget Pro');
  });

  it('keeps FBA rows separate even with shared tracking', () => {
    const fba = baseRecord({
      id: 20,
      source_kind: 'fba_scan',
      account_source: 'fba',
      fnsku: 'X001',
      order_id: 'FBA',
    });
    const order = baseRecord({ id: 21, shipping_tracking_number: '1Z999' });
    const merged = dedupeTechRecords([fba, order]);
    assert.equal(merged.length, 2);
  });
});

describe('getTechRecordRowKey', () => {
  it('uses source_kind + source_row_id', () => {
    assert.equal(
      getTechRecordRowKey(baseRecord({ source_kind: 'tech_serial', source_row_id: 42, id: 99 })),
      'tech_serial:42',
    );
  });
});

describe('techRecordToPreviewOrder', () => {
  it('maps order_db_id and stamps has_pick_scan', () => {
    const order = techRecordToPreviewOrder(
      baseRecord({ order_db_id: 900, id: 55, is_shipped: true, status: null }),
    );
    assert.equal(order.id, 900);
    assert.equal(order.has_pick_scan, true);
    assert.equal(order.status, 'SHIPPED');
  });

  it('techRecordRailId prefers order_db_id', () => {
    assert.equal(techRecordRailId(baseRecord({ order_db_id: 900, id: 55 })), 900);
  });
});
