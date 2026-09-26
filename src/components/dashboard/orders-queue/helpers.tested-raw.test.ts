/** Plan §9 field contract — tester / tested-at RAW resolution. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  nonSentinelTimestamp,
  queueRowTestedAtRaw,
  queueRowTesterNameRaw,
  type QueueRowRecord,
} from './helpers';

describe('plan §9 field contract — tester / tested-at raw resolution', () => {
  const row = (overrides: Record<string, unknown>): QueueRowRecord =>
    ({ id: 1, ...overrides }) as unknown as QueueRowRecord;

  it('nonSentinelTimestamp: empty / whitespace / the legacy "1" sentinel are missing', () => {
    assert.equal(nonSentinelTimestamp(null), null);
    assert.equal(nonSentinelTimestamp(''), null);
    assert.equal(nonSentinelTimestamp('   '), null);
    assert.equal(nonSentinelTimestamp('1'), null);
    assert.equal(nonSentinelTimestamp('2026-07-20 14:05:00'), '2026-07-20 14:05:00');
  });

  it('tested-at prefers test_date_time, then test_activity_at', () => {
    assert.equal(
      queueRowTestedAtRaw(row({ test_date_time: '2026-07-19 10:00:00', test_activity_at: '2026-07-20 14:05:00' })),
      '2026-07-19 10:00:00',
    );
    assert.equal(
      queueRowTestedAtRaw(row({ test_date_time: null, test_activity_at: '2026-07-20 14:05:00' })),
      '2026-07-20 14:05:00',
    );
    assert.equal(
      queueRowTestedAtRaw(row({ test_date_time: '1', test_activity_at: '2026-07-20 14:05:00' })),
      '2026-07-20 14:05:00',
      'sentinel test_date_time falls through to station activity',
    );
    assert.equal(queueRowTestedAtRaw(row({})), null);
  });

  it('tester name prefers the scan actor (tested_by_name) over the assignee (tester_name)', () => {
    assert.equal(
      queueRowTesterNameRaw(row({ tested_by_name: 'Alex Chen', tester_name: 'Sam Assignee' })),
      'Alex Chen',
    );
    assert.equal(queueRowTesterNameRaw(row({ tested_by_name: '  ', tester_name: 'Sam Assignee' })), 'Sam Assignee');
    assert.equal(queueRowTesterNameRaw(row({})), null);
  });
});
