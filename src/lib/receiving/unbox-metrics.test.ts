import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  buildUnboxKpiCards,
  fillUnboxKpiBuckets,
  parseUnboxKpiRange,
  parseUnboxKpiViz,
  unboxKpiRangeWindow,
} from '@/lib/receiving/unbox-metrics';

function row(over: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 1,
    receiving_id: 10,
    tracking_number: null,
    carrier: null,
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: null,
    item_name: null,
    sku: null,
    quantity: 1,
    qty_received: 0,
    condition: null,
    workflow_status: 'MATCHED',
    qa_status: null,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    scanned_at: '2026-08-03T15:00:00.000Z',
    received_at: '2026-08-03T15:00:00.000Z',
    ...over,
  } as ReceivingLineRow;
}

describe('unbox KPI canvas contract', () => {
  it('parses urange / uviz with defaults', () => {
    assert.equal(parseUnboxKpiRange(null), '7d');
    assert.equal(parseUnboxKpiRange('90d'), '90d');
    assert.equal(parseUnboxKpiViz(undefined), 'pie');
    assert.equal(parseUnboxKpiViz('line'), 'line');
  });

  it('24h window is hourly; multi-day is daily', () => {
    const now = new Date('2026-08-04T18:00:00.000Z');
    const h = unboxKpiRangeWindow('24h', now);
    assert.equal(h.granularity, 'hourly');
    assert.equal(fillUnboxKpiBuckets(h.start, h.end, h.granularity).length, 25);

    const d = unboxKpiRangeWindow('7d', now);
    assert.equal(d.granularity, 'daily');
    assert.ok(fillUnboxKpiBuckets(d.start, d.end, d.granularity).length >= 7);
  });

  it('buildUnboxKpiCards emits priority series + pie breakdown on queue', () => {
    const now = new Date('2026-08-04T18:00:00.000Z');
    const rows = [
      row({ id: 1, is_priority: true, scanned_at: '2026-08-03T12:00:00.000Z' }),
      row({ id: 2, is_priority: false, scanned_at: '2026-08-03T14:00:00.000Z' }),
      row({
        id: 3,
        priority_lane: 'expedited',
        scanned_at: '2026-08-04T10:00:00.000Z',
      }),
    ];
    const { metrics, granularity } = buildUnboxKpiCards({
      mode: 'queue',
      rows,
      range: '7d',
      serverTotal: 3,
      now,
    });
    assert.equal(granularity, 'daily');
    const priority = metrics.find((m) => m.id === 'priority');
    assert.ok(priority);
    assert.equal(priority.filterable, true);
    assert.ok(priority.series.some((p) => p.value > 0));
    assert.ok(priority.breakdown.some((b) => b.key === 'priority' && b.value === 2));
  });

  it('stuck breakdown shares isUnboxStuck membership', () => {
    const now = new Date('2026-08-04T18:00:00.000Z');
    const rows = [
      row({
        id: 1,
        workflow_status: 'ERROR',
        unboxed_at: '2026-08-04T08:00:00.000Z',
      }),
      row({
        id: 2,
        workflow_status: 'DONE',
        unboxed_at: '2026-08-04T09:00:00.000Z',
      }),
    ];
    const { metrics } = buildUnboxKpiCards({
      mode: 'history',
      rows,
      range: '7d',
      now,
    });
    const stuck = metrics.find((m) => m.id === 'stuck');
    assert.ok(stuck);
    assert.equal(stuck.filterable, true);
    assert.deepEqual(
      stuck.breakdown.find((b) => b.key === 'stuck'),
      { key: 'stuck', label: 'Stuck / error', value: 1 },
    );
  });
});
