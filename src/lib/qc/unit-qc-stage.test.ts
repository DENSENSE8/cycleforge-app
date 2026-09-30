import { test } from 'node:test';
import { strictEqual } from 'node:assert';

import { qcUnitStage } from './unit-qc-stage';

test('each verdict status reads as its QC stage — that stage decides label vs ticket', () => {
  strictEqual(qcUnitStage('TESTED'), 'passed');
  strictEqual(qcUnitStage('IN_TEST'), 'testing');
  strictEqual(qcUnitStage('ON_HOLD'), 'failed');
  strictEqual(qcUnitStage('ON_HOLD', { ticket: true }), 'ticket', 'a filed vendor ticket ends the fail path');
  strictEqual(qcUnitStage('TESTED', { ticket: true }), 'passed', 'a line ticket never overrides a pass');
});

test('the pass path runs graded → labeled → put away', () => {
  strictEqual(qcUnitStage('GRADED'), 'graded', 'graded is not passed — GRADED → TESTED is the PASS edge');
  strictEqual(qcUnitStage('LABELED'), 'labeled');
  strictEqual(qcUnitStage('STOCKED'), 'putAway');
});

test('a unit not yet benched is received; one beyond the shelf is past QC', () => {
  for (const status of ['RECEIVED', 'TRIAGED', 'UNKNOWN', '', null, undefined]) strictEqual(qcUnitStage(status), 'received', String(status));
  for (const status of ['ALLOCATED', 'SHIPPED', 'IN_REPAIR', 'SCRAPPED']) strictEqual(qcUnitStage(status), 'past', status);
  strictEqual(qcUnitStage(' tested '), 'passed', 'case and padding from older rows');
});
