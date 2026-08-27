import test from 'node:test';
import assert from 'node:assert/strict';
import { assemblePackerBoxCountReport } from './packer-box-counts';

test('assemblePackerBoxCountReport sorts by boxes then name and totals', () => {
  const report = assemblePackerBoxCountReport('2026-08-25', [
    { packer: 'Thuy', boxesPacked: 2 },
    { packer: 'Kai', boxesPacked: 1 },
    { packer: 'Tuan', boxesPacked: 34 },
  ]);
  assert.equal(report.day, '2026-08-25');
  assert.equal(report.total, 37);
  assert.deepEqual(
    report.rows.map((r) => r.packer),
    ['Tuan', 'Thuy', 'Kai'],
  );
});

test('assemblePackerBoxCountReport is empty-safe', () => {
  const report = assemblePackerBoxCountReport('2026-08-26', []);
  assert.equal(report.total, 0);
  assert.deepEqual(report.rows, []);
});
