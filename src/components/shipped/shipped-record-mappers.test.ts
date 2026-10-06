import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toDetailRecord } from '@/components/shipped/shipped-record-mappers';
import type { PackerRecord } from '@/hooks/usePackerLogs';

function fakePacker(overrides: Partial<PackerRecord> = {}): PackerRecord {
  return {
    id: 9001,
    order_row_id: 42,
    order_id: 'ORD-1',
    product_title: 'Test Product',
    quantity: '1',
    condition: 'USED',
    created_at: '2026-07-20T12:00:00.000Z',
    deadline_at: '2026-07-22T12:00:00.000Z',
    shipping_tracking_number: '1Z999',
    serial_number: 'SN-1',
    ...overrides,
  } as PackerRecord;
}

describe('toDetailRecord', () => {
  it('opens the order line (order_row_id), keeping the scan as station_activity_log_id', () => {
    const detail = toDetailRecord(fakePacker());
    assert.equal(detail.id, 42);
    assert.equal(detail.station_activity_log_id, 9001);
  });

  it('falls back to the scan id when the package matched no order line', () => {
    const detail = toDetailRecord(fakePacker({ order_row_id: null }));
    assert.equal(detail.id, 9001);
  });
});
