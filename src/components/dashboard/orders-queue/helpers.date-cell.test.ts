import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatQueueRowDateCell,
  queueRowBandDateSource,
  queueRowShipBySource,
} from '@/components/dashboard/orders-queue/helpers';

describe('queue row Date column helpers', () => {
  it('queueRowShipBySource prefers deadline then created', () => {
    assert.equal(
      queueRowShipBySource({ deadline_at: '2026-06-09T12:00:00-07:00', created_at: '2026-06-01T12:00:00-07:00' }),
      '2026-06-09T12:00:00-07:00',
    );
    assert.equal(
      queueRowShipBySource({ deadline_at: null, created_at: '2026-06-01T12:00:00-07:00' }),
      '2026-06-01T12:00:00-07:00',
    );
    assert.equal(queueRowShipBySource({ deadline_at: null, created_at: null }), null);
    assert.equal(queueRowShipBySource({ deadline_at: '1', created_at: null }), null);
  });

  it('queueRowBandDateSource flips to created for newest sort', () => {
    const record = {
      deadline_at: '2026-06-09T12:00:00-07:00',
      created_at: '2026-06-01T12:00:00-07:00',
    };
    assert.equal(queueRowBandDateSource(record, 'priority'), record.deadline_at);
    assert.equal(queueRowBandDateSource(record, 'newest'), record.created_at);
  });

  it('formatQueueRowDateCell renders compact label + ship-by tooltip', () => {
    const cell = formatQueueRowDateCell('2026-06-09T12:00:00-07:00');
    assert.ok(cell);
    assert.equal(cell!.key, '2026-06-09');
    assert.equal(cell!.label, 'Jun 9');
    assert.match(cell!.tooltip, /^Ship by · /);
    assert.match(cell!.tooltip, /Jun 9/);
    assert.match(cell!.tooltip, /2026/);
    assert.equal(formatQueueRowDateCell(null), null);
  });
});
