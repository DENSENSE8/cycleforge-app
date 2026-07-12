import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareAllocationHits,
  recommendDisposition,
} from './recommend-disposition';

test('hold override wins over every other signal', () => {
  const out = recommendDisposition({
    hold: true,
    amazonOos: true,
    velocityTier: 'A',
    openFbaPlanRemaining: 50,
  });
  assert.equal(out.disposition, 'HOLD');
  assert.deepEqual(out.reasons, ['OVERRIDE']);
  assert.ok(out.score >= 10_000);
});

test('Amazon OOS + high velocity → FBA', () => {
  const out = recommendDisposition({
    amazonOos: true,
    velocityTier: 'A',
  });
  assert.equal(out.disposition, 'FBA');
  assert.ok(out.reasons.includes('AMAZON_OOS'));
  assert.ok(out.reasons.includes('HIGH_VELOCITY'));
});

test('velocity B still counts as high velocity with OOS', () => {
  const out = recommendDisposition({ amazonOos: true, velocityTier: 'B' });
  assert.equal(out.disposition, 'FBA');
  assert.ok(out.reasons.includes('HIGH_VELOCITY'));
});

test('open FBA plan remaining → FBA even when not OOS', () => {
  const out = recommendDisposition({
    amazonOos: false,
    velocityTier: 'C',
    openFbaPlanRemaining: 3,
  });
  assert.equal(out.disposition, 'FBA');
  assert.ok(out.reasons.includes('FBA_PLAN_OPEN'));
});

test('FBA filled → PREBOX_STOCK', () => {
  const out = recommendDisposition({
    fbaFilled: true,
    velocityTier: 'A',
    openFbaPlanRemaining: 0,
  });
  assert.equal(out.disposition, 'PREBOX_STOCK');
  assert.ok(out.reasons.includes('FBA_FILLED'));
});

test('low velocity without plan → PREBOX_STOCK', () => {
  const out = recommendDisposition({
    velocityTier: 'D',
    openFbaPlanRemaining: 0,
    fbaFilled: false,
  });
  assert.equal(out.disposition, 'PREBOX_STOCK');
  assert.ok(out.reasons.includes('LOW_VELOCITY'));
});

test('Amazon OOS without high velocity still prefers FBA', () => {
  const out = recommendDisposition({
    amazonOos: true,
    velocityTier: null,
    openFbaPlanRemaining: 0,
  });
  assert.equal(out.disposition, 'FBA');
  assert.ok(out.reasons.includes('AMAZON_OOS'));
});

test('default policy is PREBOX_STOCK when no signals', () => {
  const out = recommendDisposition({});
  assert.equal(out.disposition, 'PREBOX_STOCK');
  assert.ok(out.reasons.includes('DEFAULT_POLICY'));
});

test('tenant defaultDisposition FBA is honored when no stronger rule', () => {
  const out = recommendDisposition({ defaultDisposition: 'FBA' });
  assert.equal(out.disposition, 'FBA');
  assert.ok(out.reasons.includes('DEFAULT_POLICY'));
});

test('open plan beats low-velocity stock path', () => {
  const plan = recommendDisposition({
    velocityTier: 'D',
    openFbaPlanRemaining: 1,
  });
  const stock = recommendDisposition({
    velocityTier: 'D',
    openFbaPlanRemaining: 0,
  });
  assert.equal(plan.disposition, 'FBA');
  assert.equal(stock.disposition, 'PREBOX_STOCK');
  assert.ok(plan.score > stock.score);
});

test('compareAllocationHits sorts by score then age then id', () => {
  const rows = [
    { score: 100, testedAt: '2026-07-10T12:00:00Z', entityId: 2 },
    { score: 200, testedAt: '2026-07-11T12:00:00Z', entityId: 1 },
    { score: 100, testedAt: '2026-07-09T12:00:00Z', entityId: 3 },
    { score: 100, testedAt: '2026-07-09T12:00:00Z', entityId: 1 },
  ];
  const sorted = [...rows].sort(compareAllocationHits);
  assert.equal(sorted[0].score, 200);
  assert.equal(sorted[1].entityId, 1); // same day as 3, lower id
  assert.equal(sorted[2].entityId, 3);
  assert.equal(sorted[3].entityId, 2);
});
