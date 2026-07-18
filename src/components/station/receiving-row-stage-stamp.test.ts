import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReceivingRowStageStamp } from '@/components/station/receiving-lines-table-helpers';

describe('resolveReceivingRowStageStamp', () => {
  it('unboxed axis prefers unboxed_at and omits created_at fallback', () => {
    assert.equal(
      resolveReceivingRowStageStamp({ unboxed_at: null, scanned_at: '2026-07-01T10:00:00Z' }, 'unboxed'),
      null,
    );
    assert.deepEqual(
      resolveReceivingRowStageStamp(
        { unboxed_at: '2026-07-02T18:00:00Z', unboxed_by_name: 'Ada', scanned_at: '2026-07-01T10:00:00Z' },
        'unboxed',
      ),
      { instant: '2026-07-02T18:00:00Z', label: 'Unboxed', staffName: 'Ada' },
    );
  });

  it('scanned axis uses scan then door-scan', () => {
    assert.deepEqual(
      resolveReceivingRowStageStamp(
        { scanned_at: '2026-07-01T10:00:00Z', scanned_by_name: 'Bo', received_at: '2026-07-01T11:00:00Z' },
        'scanned',
      ),
      { instant: '2026-07-01T10:00:00Z', label: 'Scanned', staffName: 'Bo' },
    );
    assert.deepEqual(
      resolveReceivingRowStageStamp(
        { scanned_at: null, received_at: '2026-07-01T11:00:00Z', received_by_name: 'Cy' },
        'scanned',
      ),
      { instant: '2026-07-01T11:00:00Z', label: 'Scanned', staffName: 'Cy' },
    );
  });

  it('received axis prefers received_done_at then unboxed', () => {
    assert.deepEqual(
      resolveReceivingRowStageStamp(
        { received_done_at: '2026-07-03T12:00:00Z', unboxed_at: '2026-07-02T18:00:00Z' },
        'received',
      ),
      { instant: '2026-07-03T12:00:00Z', label: 'Received', staffName: null },
    );
  });
});
