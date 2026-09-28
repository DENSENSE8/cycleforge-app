import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';

import { summarizeUnitQc, unitQcEmptyReason, unitQcMeta, unitQcVerdict, type UnitQcStep } from './unit-qc';

function step(id: number, result: Partial<UnitQcStep> = {}): UnitQcStep {
  return {
    step_id: id,
    step_label: `Step ${id}`,
    step_type: 'QC',
    sort_order: id,
    value_kind: null,
    value_unit: null,
    value_enum: null,
    pass_min: null,
    pass_max: null,
    passed: null,
    value_num: null,
    value_text: null,
    verified_by: null,
    verified_by_name: null,
    verified_at: null,
    notes: null,
    procedure_version_id: null,
    ...result,
  };
}

const catalogued = { sku: '00039-BK', sku_catalog_id: 174 };

test('tally counts verdicts; a reading without a verdict stays open', () => {
  const summary = summarizeUnitQc([
    step(1, { passed: true, verified_at: '2026-09-24T20:00:00Z', verified_by_name: 'Ana' }),
    step(2, { passed: false, verified_at: '2026-09-24T21:00:00Z', verified_by_name: 'Michael' }),
    step(3, { passed: null, value_text: 'scuffed', verified_at: '2026-09-24T19:00:00Z', verified_by_name: 'Ana' }),
    step(4),
  ]);
  deepStrictEqual(
    { passed: summary.passed, failed: summary.failed, open: summary.open, total: summary.total },
    { passed: 1, failed: 1, open: 2, total: 4 },
  );
});

test('the last stamp is the latest server time, not list order', () => {
  const summary = summarizeUnitQc([
    step(1, { passed: true, verified_at: '2026-09-24T23:41:00Z', verified_by_name: 'Michael' }),
    step(2, { passed: true, verified_at: '2026-09-24T18:00:00Z', verified_by_name: 'Ana' }),
  ]);
  deepStrictEqual(summary.last, { name: 'Michael', at: '2026-09-24T23:41:00Z' });
  strictEqual(summarizeUnitQc([step(1)]).last, null);
});

test('one failed step fails the unit; it passes only when every step passed', () => {
  const passed = { passed: true, verified_at: '2026-09-24T20:00:00Z' };
  strictEqual(unitQcVerdict(summarizeUnitQc([step(1, passed), step(2, { passed: false })])), 'failed');
  strictEqual(unitQcVerdict(summarizeUnitQc([step(1, { passed: false }), step(2)])), 'failed', 'a fail is final while others are open');
  strictEqual(unitQcVerdict(summarizeUnitQc([step(1, passed), step(2)])), 'open');
  strictEqual(unitQcVerdict(summarizeUnitQc([step(1, passed), step(2, passed)])), 'passed');
  strictEqual(unitQcVerdict(summarizeUnitQc([])), 'open', 'no steps is not a pass');
});

test('each empty case says why', () => {
  strictEqual(unitQcEmptyReason({ sku: null, sku_catalog_id: null }, []), 'Unit has no SKU — nothing to check');
  strictEqual(unitQcEmptyReason({ sku: '00102-BK', sku_catalog_id: null }, []), 'SKU 00102-BK is not in the catalog');
  strictEqual(unitQcEmptyReason({ sku: '00102-BK', sku_catalog_id: 9 }, []), 'No checklist published for 00102-BK');
  strictEqual(unitQcEmptyReason(catalogued, [step(1)]), null);
});

test('door meta is the empty reason, or the tally with the last stamp when there is one', () => {
  strictEqual(unitQcMeta({ sku: '00102-BK', sku_catalog_id: 9 }, []), 'No checklist published for 00102-BK');
  strictEqual(unitQcMeta(catalogued, [step(1), step(2)]), '0 passed · 0 failed · 2 open');
  strictEqual(
    unitQcMeta(catalogued, [step(1, { passed: true, verified_at: '2026-09-24T23:41:00Z', verified_by_name: 'Michael' })]),
    '1 passed · 0 failed · 0 open · Michael, Sep 24, 4:41 PM',
  );
});
