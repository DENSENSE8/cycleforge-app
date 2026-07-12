import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fulfillmentCountsFromCombos,
  ZERO_FULFILLMENT_COUNTS,
} from '@/lib/unshipped-state';

describe('fulfillmentCountsFromCombos', () => {
  it('returns zeros for empty combos', () => {
    assert.deepEqual(fulfillmentCountsFromCombos([]), ZERO_FULFILLMENT_COUNTS);
  });

  it('maps raw signal combos through deriveFulfillmentState', () => {
    const counts = fulfillmentCountsFromCombos([
      { hasTechScan: false, blocked: false, count: 4 },
      { hasTechScan: true, blocked: false, count: 2 },
      { hasTechScan: true, blocked: true, count: 1 },
      { hasTechScan: false, blocked: true, count: 3 },
    ]);
    assert.deepEqual(counts, { PENDING: 4, TESTED: 2, BLOCKED: 4 });
  });
});
