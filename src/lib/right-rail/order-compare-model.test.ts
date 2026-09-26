/** Divergence rules for the rail's two-row compare body (plan Phase 3). */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildOrderCompare, type OrderCompareRow } from './order-compare-model';

function factFor(left: OrderCompareRow, right: OrderCompareRow, key: string) {
  const fact = buildOrderCompare(left, right).facts.find((f) => f.key === key);
  assert.ok(fact, `expected a "${key}" fact`);
  return fact;
}

test('identical rows diverge on nothing', () => {
  const row: OrderCompareRow = {
    order_id: 'ORD-1',
    product_title: 'Widget',
    sku: 'SKU-1',
    condition: 'A',
    quantity: '1',
    serial_number: 'SN1',
    shipping_tracking_number: '1Z999',
    account_source: 'ebay',
    ship_by_date: '2026-08-05',
  };
  const result = buildOrderCompare(row, { ...row });
  assert.equal(result.divergentCount, 0);
  assert.ok(result.facts.every((f) => !f.diverges));
});

test('a differing value diverges', () => {
  const fact = factFor({ sku: 'SKU-1' }, { sku: 'SKU-2' }, 'sku');
  assert.equal(fact.diverges, true);
  assert.equal(fact.left, 'SKU-1');
  assert.equal(fact.right, 'SKU-2');
});

// ─── Absence ────────────────────────────────────────────────────────────────

test('present on one side and absent on the other IS a divergence', () => {
  const fact = factFor({ serial_number: 'SN1' }, {}, 'serial_number');
  assert.equal(fact.diverges, true, '"we have no serial for this one" is the finding');
  assert.equal(fact.right, null, 'absent stays null so the view can render the em dash');
  assert.equal(fact.bothMissing, false);
});

test('absent on BOTH sides is agreement, not a finding', () => {
  const fact = factFor({}, {}, 'serial_number');
  assert.equal(fact.diverges, false);
  assert.equal(fact.bothMissing, true);
});

test('blank, whitespace and dash sentinels all read as absent', () => {
  for (const value of ['', '   ', '-', '--', '---']) {
    const fact = factFor({ sku: value }, {}, 'sku');
    assert.equal(fact.left, null, `"${value}" should read as absent`);
    assert.equal(fact.bothMissing, true, `"${value}" vs missing should agree`);
  }
});

test('comparableCount excludes facts neither row can answer', () => {
  const result = buildOrderCompare({ order_id: 'ORD-1' }, { order_id: 'ORD-1' });
  assert.equal(result.divergentCount, 0);
  assert.equal(result.comparableCount, 1, 'only order_id is answerable here');
  assert.ok(result.facts.length > 1, 'the other facts still render, as both-missing');
});

// ─── Dates: civil day, not raw string ───────────────────────────────────────

test('a civil key and a timestamptz naming the same warehouse day agree', () => {
  // Noon UTC is 5am in the warehouse zone — unambiguously the same civil day,
  // which is the shape this comparison exists to collapse (`ship_by_date` is a
  // civil key, `deadline_at` is a timestamptz).
  const fact = factFor(
    { ship_by_date: '2026-08-05' },
    { deadline_at: '2026-08-05T12:00:00Z' },
    'ship_by',
  );
  assert.equal(fact.diverges, false, 'same day, two column types — not a divergence');
});

test('the day is the WAREHOUSE civil day, matching the grid cell', () => {
  // Deliberate: UTC midnight on the 5th is the evening of the 4th in `WAREHOUSE_TIME_ZONE`, so this pair AGREES on Aug 4.
  const fact = factFor(
    { deadline_at: '2026-08-05T00:00:00Z' },
    { ship_by_date: '2026-08-04' },
    'ship_by',
  );
  assert.equal(fact.diverges, false);
});

test('genuinely different days still diverge', () => {
  const fact = factFor({ ship_by_date: '2026-08-05' }, { ship_by_date: '2026-08-06' }, 'ship_by');
  assert.equal(fact.diverges, true);
});

test('ship_by falls back to deadline_at on either side', () => {
  const fact = factFor({ deadline_at: '2026-08-05' }, { ship_by_date: '2026-08-05' }, 'ship_by');
  assert.equal(fact.diverges, false);
});

// ─── Multi-value identifiers ────────────────────────────────────────────────

test('the same serials in a different join order agree', () => {
  const fact = factFor({ serial_number: 'SN1, SN2' }, { serial_number: 'SN2,SN1' }, 'serial_number');
  assert.equal(fact.diverges, false);
  assert.equal(fact.left, 'SN1, SN2', 'the raw value is preserved for display');
});

test('a genuinely different serial set diverges', () => {
  const fact = factFor({ serial_number: 'SN1,SN2' }, { serial_number: 'SN1,SN3' }, 'serial_number');
  assert.equal(fact.diverges, true);
});

test('a missing serial against a two-serial row diverges', () => {
  const fact = factFor({ serial_number: 'SN1,SN2' }, { serial_number: 'SN1' }, 'serial_number');
  assert.equal(fact.diverges, true);
});

// ─── Normalization ──────────────────────────────────────────────────────────

test('case and inner whitespace do not count as divergence', () => {
  assert.equal(factFor({ condition: 'NEW' }, { condition: 'new' }, 'condition').diverges, false);
  assert.equal(
    factFor({ product_title: 'Blue  Widget' }, { product_title: 'Blue Widget' }, 'product_title')
      .diverges,
    false,
  );
});

test('quantity compares numerically, not as text', () => {
  assert.equal(factFor({ quantity: '1' }, { quantity: 1 }, 'quantity').diverges, false);
  assert.equal(factFor({ quantity: '01' }, { quantity: '1' }, 'quantity').diverges, false);
  assert.equal(factFor({ quantity: '1' }, { quantity: '2' }, 'quantity').diverges, true);
});

test('product title reads either row shape spelling', () => {
  const fact = factFor({ product_title: 'Widget' }, { item_name: 'Widget' }, 'product_title');
  assert.equal(fact.diverges, false, 'lane spelling is not an order difference');
});

test('tracking reads either row shape spelling', () => {
  const fact = factFor(
    { shipping_tracking_number: '1Z999' },
    { tracking_number: '1Z999' },
    'tracking',
  );
  assert.equal(fact.diverges, false);
});

// ─── Column stability ───────────────────────────────────────────────────────

test('left/right follow argument order, never id order', () => {
  const a: OrderCompareRow = { id: 900, order_id: 'ORD-A' };
  const b: OrderCompareRow = { id: 100, order_id: 'ORD-B' };
  const fact = factFor(a, b, 'order_id');
  assert.equal(fact.left, 'ORD-A', 'selection order decides the columns');
  assert.equal(fact.right, 'ORD-B');
});

test('every fact carries a stable key and label', () => {
  const { facts } = buildOrderCompare({}, {});
  const keys = facts.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length, 'keys are unique (React list keys)');
  assert.ok(facts.every((f) => f.label.trim().length > 0));
});
