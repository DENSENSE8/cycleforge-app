import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { derivedPackerRecordToQueueRow, toDetailRecord } from '@/components/shipped/shipped-record-mappers';
import { resolveRowStatus } from '@/components/dashboard/orders-queue/helpers';
import type { DerivedPackerRecord } from '@/lib/shipped-records';

function fakePacker(overrides: Partial<DerivedPackerRecord> = {}): DerivedPackerRecord {
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
    outboundState: 'SCANNED_OUT',
    hasLeft: true,
    effShipTime: '2026-07-20T15:00:00.000Z',
    ...overrides,
  } as DerivedPackerRecord;
}

describe('derivedPackerRecordToQueueRow', () => {
  it('keeps packer-log id as list key and carries outboundState', () => {
    const row = derivedPackerRecordToQueueRow(fakePacker());
    assert.equal(row.id, 9001);
    assert.equal(row.outboundState, 'SCANNED_OUT');
    assert.equal(row.order_id, 'ORD-1');
    assert.equal(row.product_title, 'Test Product');
  });

  it('detail open still uses order_row_id via toDetailRecord', () => {
    const detail = toDetailRecord(fakePacker());
    assert.equal(detail.id, 42);
  });

  it('resolveRowStatus(shipped) uses outboundState meta', () => {
    const row = derivedPackerRecordToQueueRow(fakePacker({ outboundState: 'DELIVERED' }));
    const status = resolveRowStatus(row, 'shipped');
    assert.equal(status.label, 'Delivered');
  });
});
