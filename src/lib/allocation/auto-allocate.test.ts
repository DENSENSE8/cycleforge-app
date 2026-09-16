import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The rules half of auto-allocation. Lives in `./plan-allocations` because
 * `./auto-allocate` reaches the Neon pool, which carries `server-only` and
 * cannot be imported under node:test.
 */
import {
  planAllocations,
  type AllocationDemandLine,
  type AllocationSupplyUnit,
} from './plan-allocations';
import type { ConditionGrade } from '@/lib/orders/condition-tier';

function line(
  orderId: number,
  overrides: Partial<AllocationDemandLine> = {},
): AllocationDemandLine {
  return {
    orderId,
    orderNumber: `ORD-${orderId}`,
    sku: 'SKU-1',
    quantity: 1,
    soldCondition: 'USED',
    ...overrides,
  };
}

function unit(
  serialUnitId: number,
  grade: ConditionGrade | null,
  overrides: Partial<AllocationSupplyUnit> = {},
): AllocationSupplyUnit {
  return { serialUnitId, sku: 'SKU-1', grade, location: 'A-01', ...overrides };
}

test('a unit is never allocated twice across lines; the second line reports NO_STOCK', () => {
  const plan = planAllocations([line(1), line(2)], [unit(50, 'USED_B')]);

  assert.deepEqual(plan.allocations, [{ orderId: 1, serialUnitId: 50 }]);
  assert.equal(plan.shortfalls.length, 1);
  assert.equal(plan.shortfalls[0].orderId, 2);
  assert.equal(plan.shortfalls[0].reason, 'NO_STOCK');
  assert.match(plan.shortfalls[0].detail, /committed to earlier lines/);
});

test('quantity 2 with one unit in stock allocates it AND reports PARTIAL', () => {
  const plan = planAllocations([line(1, { quantity: 2 })], [unit(50, 'USED_B')]);

  assert.deepEqual(plan.allocations, [{ orderId: 1, serialUnitId: 50 }]);
  assert.equal(plan.shortfalls.length, 1);
  assert.equal(plan.shortfalls[0].reason, 'PARTIAL');
  assert.equal(plan.shortfalls[0].needed, 2);
  assert.equal(plan.shortfalls[0].matched, 1);
});

test('bare "USED" promises no tier, so a USED_B unit satisfies it', () => {
  const plan = planAllocations([line(1, { soldCondition: 'USED' })], [unit(50, 'USED_B')]);

  assert.deepEqual(plan.allocations, [{ orderId: 1, serialUnitId: 50 }]);
  assert.deepEqual(plan.shortfalls, []);
});

test('a PARTS unit is refused for a sale that was not sold as parts', () => {
  const plan = planAllocations([line(1, { soldCondition: 'USED' })], [unit(50, 'PARTS')]);

  assert.deepEqual(plan.allocations, []);
  assert.equal(plan.shortfalls[0].reason, 'TIER_UNMET');
  assert.match(plan.shortfalls[0].detail, /not sold as parts/);
});

test('a PARTS unit IS allowed when parts is what was sold', () => {
  const plan = planAllocations(
    [line(1, { soldCondition: 'For parts or not working' })],
    [unit(50, 'PARTS')],
  );

  assert.deepEqual(plan.allocations, [{ orderId: 1, serialUnitId: 50 }]);
  assert.deepEqual(plan.shortfalls, []);
});

test('an "Excellent" sale refuses a USED_C unit with TIER_UNMET', () => {
  const plan = planAllocations([line(1, { soldCondition: 'Excellent' })], [unit(50, 'USED_C')]);

  assert.deepEqual(plan.allocations, []);
  assert.equal(plan.shortfalls[0].reason, 'TIER_UNMET');
  assert.match(plan.shortfalls[0].detail, /USED_C.*LIKE_NEW/);
});

test('ungraded-only stock reports UNGRADED_ONLY, not TIER_UNMET', () => {
  const plan = planAllocations([line(1)], [unit(50, null), unit(51, null)]);

  assert.deepEqual(plan.allocations, []);
  assert.equal(plan.shortfalls[0].reason, 'UNGRADED_ONLY');
  assert.equal(plan.shortfalls[0].matched, 0);
});

test('mixed ungraded + below-tier stock is TIER_UNMET (graded stock exists and fails)', () => {
  const plan = planAllocations(
    [line(1, { soldCondition: 'Excellent' })],
    [unit(50, null), unit(51, 'USED_C')],
  );

  assert.equal(plan.shortfalls[0].reason, 'TIER_UNMET');
});

test('a line with no sku reports NO_SKU without consuming stock', () => {
  const plan = planAllocations([line(1, { sku: null }), line(2)], [unit(50, 'USED_B')]);

  assert.deepEqual(plan.allocations, [{ orderId: 2, serialUnitId: 50 }]);
  assert.equal(plan.shortfalls.length, 1);
  assert.equal(plan.shortfalls[0].reason, 'NO_SKU');
  assert.equal(plan.shortfalls[0].orderId, 1);
});

test('the cheapest satisfying unit is spent first, protecting premium stock', () => {
  const plan = planAllocations(
    [line(1, { soldCondition: 'USED' })],
    [unit(50, 'BRAND_NEW'), unit(51, 'USED_A'), unit(52, 'USED_B')],
  );

  assert.deepEqual(plan.allocations, [{ orderId: 1, serialUnitId: 52 }]);
});

test('within one grade, bin order then id decides — a plan is reproducible', () => {
  const supply = [
    unit(80, 'USED_A', { location: 'C-09' }),
    unit(60, 'USED_A', { location: 'A-01' }),
    unit(61, 'USED_A', { location: 'A-01' }),
  ];

  const plan = planAllocations([line(1, { quantity: 3 })], supply);

  assert.deepEqual(plan.allocations, [
    { orderId: 1, serialUnitId: 60 },
    { orderId: 1, serialUnitId: 61 },
    { orderId: 1, serialUnitId: 80 },
  ]);
  assert.deepEqual(plan.shortfalls, []);
});

test('another SKU\'s stock is never borrowed', () => {
  const plan = planAllocations([line(1, { sku: 'SKU-1' })], [unit(50, 'USED_A', { sku: 'SKU-2' })]);

  assert.deepEqual(plan.allocations, []);
  assert.equal(plan.shortfalls[0].reason, 'NO_STOCK');
  assert.match(plan.shortfalls[0].detail, /No stocked unit of SKU-1/);
});

test('a blank quantity still needs one unit', () => {
  const plan = planAllocations([line(1, { quantity: Number.NaN })], [unit(50, 'USED_B')]);

  assert.deepEqual(plan.allocations, [{ orderId: 1, serialUnitId: 50 }]);
  assert.deepEqual(plan.shortfalls, []);
});
