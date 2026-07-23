import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReceivingRowStageStamp } from '@/components/station/receiving-lines-table-helpers';

describe('resolveReceivingRowStageStamp', () => {
  it('unboxed axis prefers unboxed_at; falls back to scan when never unboxed', () => {
    assert.deepEqual(
      resolveReceivingRowStageStamp(
        { unboxed_at: null, scanned_at: '2026-07-01T10:00:00Z', scanned_by_name: 'Bo' },
        'unboxed',
      ),
      { instant: '2026-07-01T10:00:00Z', label: 'Scanned', staffName: 'Bo' },
    );
    assert.deepEqual(
      resolveReceivingRowStageStamp(
        { unboxed_at: '2026-07-02T18:00:00Z', unboxed_by_name: 'Ada', scanned_at: '2026-07-01T10:00:00Z' },
        'unboxed',
      ),
      { instant: '2026-07-02T18:00:00Z', label: 'Unboxed', staffName: 'Ada' },
    );
    assert.equal(
      resolveReceivingRowStageStamp({ unboxed_at: null, scanned_at: null, received_at: null }, 'unboxed'),
      null,
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

  it('tested axis prefers tested_at; falls back to unboxed', () => {
    assert.deepEqual(
      resolveReceivingRowStageStamp(
        { tested_at: '2026-07-04T09:00:00Z', unboxed_at: '2026-07-02T18:00:00Z' },
        'tested',
      ),
      { instant: '2026-07-04T09:00:00Z', label: 'Tested', staffName: null },
    );
    assert.deepEqual(
      resolveReceivingRowStageStamp(
        { tested_at: null, unboxed_at: '2026-07-02T18:00:00Z', unboxed_by_name: 'Ada' },
        'tested',
      ),
      { instant: '2026-07-02T18:00:00Z', label: 'Unboxed', staffName: 'Ada' },
    );
  });
});
