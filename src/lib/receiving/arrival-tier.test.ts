/** Package urgency tier resolver — precedence and the platform default table. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARRIVAL_FALLBACK_TIER,
  asArrivalTier,
  arrivalTierLabel,
  resolveArrivalTier,
} from './arrival-tier';

test('an explicit carton tier wins over everything', () => {
  assert.deepEqual(
    resolveArrivalTier({
      cartonTier: 3,
      inboundOrderTiers: [0],
      stockoutDemand: true,
      isReturn: true,
      sourcePlatform: 'goodwill',
    }),
    { tier: 3, source: 'carton' },
  );
});

test('the inbound order tier reaches a carton that has none — the most urgent order wins', () => {
  assert.deepEqual(
    resolveArrivalTier({ cartonTier: null, inboundOrderTiers: [2, null, 1], stockoutDemand: true }),
    { tier: 1, source: 'inbound_order' },
  );
});

test('stock-out demand is tier 0 when no explicit tier exists', () => {
  assert.deepEqual(
    resolveArrivalTier({ cartonTier: null, inboundOrderTiers: [], stockoutDemand: true, sourcePlatform: 'goodwill' }),
    { tier: 0, source: 'stockout' },
  );
});

test('returns and open claims shelve at tier 1, ahead of the platform default', () => {
  assert.deepEqual(resolveArrivalTier({ cartonTier: null, isReturn: true, sourcePlatform: 'goodwill' }), {
    tier: 1,
    source: 'return',
  });
  assert.deepEqual(resolveArrivalTier({ cartonTier: null, hasOpenClaim: true }), { tier: 1, source: 'claim' });
});

test('platform default: goodwill is Low (3), an unknown platform falls back to 2', () => {
  assert.deepEqual(resolveArrivalTier({ cartonTier: null, sourcePlatform: 'Goodwill' }), {
    tier: 3,
    source: 'platform',
  });
  assert.deepEqual(resolveArrivalTier({ cartonTier: null, sourcePlatform: 'aliexpress' }), {
    tier: ARRIVAL_FALLBACK_TIER,
    source: 'default',
  });
  assert.deepEqual(resolveArrivalTier({ cartonTier: undefined }), { tier: 2, source: 'default' });
});

test('out-of-range stored values are ignored, not trusted', () => {
  assert.equal(asArrivalTier(7), null);
  assert.equal(asArrivalTier(-1), null);
  assert.equal(asArrivalTier('1'), 1);
  assert.deepEqual(resolveArrivalTier({ cartonTier: 9, inboundOrderTiers: [5] }), { tier: 2, source: 'default' });
});

test('tier labels are the house priority ladder', () => {
  assert.deepEqual([0, 1, 2, 3].map(arrivalTierLabel), ['Priority', 'High', 'Medium', 'Low']);
});
