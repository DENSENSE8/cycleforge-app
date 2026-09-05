import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QA_STATION_EXCEPTION_ORDER,
  QA_STATION_HOPS,
  QA_STATION_SCAN_KINDS,
  QA_STATION_SCAN_TRACKING,
  QA_STATION_STATE_BUTTONS,
  isQaStationScanKind,
} from './station-scan-states';
import {
  QA_FIXTURE_TRACKING_PACKED,
  QA_FIXTURE_TRACKING_PENDING,
  QA_FIXTURE_TRACKING_UNMATCHED,
} from '@/lib/tenancy/qa-org';

describe('qa station scan states', () => {
  test('incoming tracking is the pending fixture, unmatched is reserved and unused', () => {
    assert.equal(QA_STATION_SCAN_TRACKING.incoming, QA_FIXTURE_TRACKING_PENDING);
    assert.equal(QA_STATION_SCAN_TRACKING.unmatched, QA_FIXTURE_TRACKING_UNMATCHED);
    assert.notEqual(QA_STATION_SCAN_TRACKING.unmatched, QA_FIXTURE_TRACKING_PENDING);
    assert.notEqual(QA_STATION_SCAN_TRACKING.unmatched, QA_FIXTURE_TRACKING_PACKED);
  });

  test('exception session is not a found order', () => {
    assert.equal(QA_STATION_EXCEPTION_ORDER.orderFound, false);
    assert.equal(QA_STATION_EXCEPTION_ORDER.sourceType, 'exception');
    assert.match(QA_STATION_EXCEPTION_ORDER.inlineMicrocopy ?? '', /not in system/i);
  });

  test('kind guard and hop list cover the scan stations', () => {
    assert.equal(isQaStationScanKind('incoming'), true);
    assert.equal(isQaStationScanKind('bogus'), false);
    assert.deepEqual([...QA_STATION_SCAN_KINDS], ['incoming', 'exception', 'unmatched', 'clear']);
    assert.ok(QA_STATION_HOPS.some((h) => h.href === '/unbox'));
    assert.ok(QA_STATION_HOPS.some((h) => h.href === '/test'));
    assert.equal(QA_STATION_STATE_BUTTONS.length, 3);
  });
});
