/** Plan §9 field contract — tested RAW resolution. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nonSentinelTimestamp } from './helpers';

describe('plan §9 field contract — tested raw resolution', () => {
  it('nonSentinelTimestamp: empty / whitespace / the legacy "1" sentinel are missing', () => {
    assert.equal(nonSentinelTimestamp(null), null);
    assert.equal(nonSentinelTimestamp(''), null);
    assert.equal(nonSentinelTimestamp('   '), null);
    assert.equal(nonSentinelTimestamp('1'), null);
    assert.equal(nonSentinelTimestamp('2026-07-20 14:05:00'), '2026-07-20 14:05:00');
  });
});
