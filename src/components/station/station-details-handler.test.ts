import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStationDetailsPanelContext } from '@/components/station/station-details-context';
import { techRecordToDetail } from '@/components/station/tech-record-mappers';
import { getOpenShippedDetailsPayload } from '@/utils/events';

test('resolveStationDetailsPanelContext: queue payload → queue panel', () => {
  assert.equal(resolveStationDetailsPanelContext('queue', 'history', 'tech'), 'queue');
});

test('resolveStationDetailsPanelContext: packer station defaults to packer', () => {
  assert.equal(resolveStationDetailsPanelContext(undefined, 'history', 'packer'), 'packer');
});

test('resolveStationDetailsPanelContext: tech station defaults to station', () => {
  assert.equal(resolveStationDetailsPanelContext(undefined, 'history', 'tech'), 'station');
});

test('getOpenShippedDetailsPayload unwraps wrapped queue events', () => {
  const order = { id: 42, order_id: 'ORD-1', test_activity_at: '2026-07-01 10:00:00' };
  const payload = getOpenShippedDetailsPayload({ order, context: 'queue' });
  assert.equal(payload?.order.id, 42);
  assert.equal(payload?.context, 'queue');
  assert.equal(payload?.order.test_activity_at, '2026-07-01 10:00:00');
});

test('techRecordToDetail maps test_activity_at from created_at', () => {
  const detail = techRecordToDetail({
    id: 9,
    created_at: '2026-07-01 12:00:00',
    shipping_tracking_number: '1Z999',
    serial_number: 'SN1',
    tested_by: 3,
    order_id: 'ORD-9',
    product_title: 'Widget',
    condition: 'Used',
    sku: 'SKU-9',
  });
  assert.equal(detail.test_date_time, '2026-07-01 12:00:00');
  assert.equal(detail.test_activity_at, '2026-07-01 12:00:00');
  assert.equal(detail.tester_id, 3);
});
