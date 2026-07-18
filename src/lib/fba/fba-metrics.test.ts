import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFbaBoardStageCounts,
  resolveFbaBoardMetrics,
  ZERO_FBA_BOARD_COUNTS,
} from './fba-metrics';
import type { FbaBoardItem } from './types';

function item(status: string, qty: number): FbaBoardItem {
  return {
    item_id: Math.floor(Math.random() * 1e6),
    item_status: status,
    actual_qty: qty,
  } as unknown as FbaBoardItem;
}

test('computeFbaBoardStageCounts: empty board is all zeros', () => {
  assert.deepEqual(computeFbaBoardStageCounts([]), ZERO_FBA_BOARD_COUNTS);
});

test('computeFbaBoardStageCounts: buckets by uppercased status, sums units', () => {
  const counts = computeFbaBoardStageCounts([
    item('planned', 2),
    item('PLANNED', 1),
    item('tested', 3),
    item('PACKED', 0),
    item('label_assigned', 4),
    item('OUT_OF_STOCK', 1),
    item('SOMETHING_ELSE', 5),
  ]);
  assert.equal(counts.lines, 7);
  assert.equal(counts.units, 2 + 1 + 3 + 0 + 4 + 1 + 5);
  assert.equal(counts.PLANNED, 2);
  assert.equal(counts.TESTED, 1);
  assert.equal(counts.PACKED, 1);
  assert.equal(counts.LABEL_ASSIGNED, 1);
  assert.equal(counts.OUT_OF_STOCK, 1);
});

test('computeFbaBoardStageCounts: negative / NaN qty never subtracts', () => {
  const counts = computeFbaBoardStageCounts([item('PLANNED', -3), item('TESTED', NaN)]);
  assert.equal(counts.units, 0);
});

test('resolveFbaBoardMetrics: stable ids, values match counts, facets wired', () => {
  const metrics = resolveFbaBoardMetrics({
    lines: 10,
    units: 25,
    PLANNED: 4,
    TESTED: 3,
    PACKED: 2,
    LABEL_ASSIGNED: 1,
    OUT_OF_STOCK: 0,
  });
  assert.deepEqual(
    metrics.map((m) => m.id),
    ['fba-lines', 'fba-units', 'fba-planned', 'fba-tested', 'fba-packed', 'fba-combined', 'fba-oos'],
  );
  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
  assert.equal(byId['fba-lines'].value, '10');
  assert.equal(byId['fba-lines'].filterStatus, 'ALL');
  assert.equal(byId['fba-units'].value, '25');
  assert.equal(byId['fba-units'].filterStatus, undefined);
  assert.equal(byId['fba-planned'].filterStatus, 'PLANNED');
  assert.equal(byId['fba-oos'].intent, 'neutral');
});

test('resolveFbaBoardMetrics: OOS goes bad only when non-zero', () => {
  const metrics = resolveFbaBoardMetrics({ ...ZERO_FBA_BOARD_COUNTS, OUT_OF_STOCK: 2 });
  const oos = metrics.find((m) => m.id === 'fba-oos');
  assert.equal(oos?.intent, 'bad');
  assert.equal(oos?.severity, 2);
});
