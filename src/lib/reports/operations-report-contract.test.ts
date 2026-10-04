import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStaffOperationsReport,
  medianOperationSeconds,
  type ActiveOperation,
  type MeasuredOperation,
} from './operations-report-contract';

test('medianOperationSeconds handles odd and even measured samples', () => {
  assert.equal(medianOperationSeconds([]), null);
  assert.equal(medianOperationSeconds([30, 10, 20]), 20);
  assert.equal(medianOperationSeconds([10, 20, 30, 40]), 25);
});

test('staff report keeps zero-work packers and separates pick from pack time', () => {
  const activity: MeasuredOperation[] = [
    {
      key: 'pick:1', kind: 'pick', staffId: 7, staffName: 'Ari', title: 'Order 100', subtitle: null,
      startedAt: '2026-10-01T16:00:00.000Z', completedAt: '2026-10-01T16:02:00.000Z', durationSeconds: 120, href: null,
    },
    {
      key: 'pack:2', kind: 'pack', staffId: 7, staffName: 'Ari', title: 'SKU 1', subtitle: null,
      startedAt: null, completedAt: '2026-10-01T16:05:00.000Z', durationSeconds: 60, href: null,
    },
    {
      key: 'pack:3', kind: 'pack', staffId: 7, staffName: 'Ari', title: 'SKU 2', subtitle: null,
      startedAt: null, completedAt: '2026-10-01T16:08:00.000Z', durationSeconds: 180, href: null,
    },
  ];
  const active: ActiveOperation[] = [{
    key: 'pick:4', kind: 'pick', staffId: 7, staffName: 'Ari', title: 'Order 101',
    startedAt: '2026-10-01T16:10:00.000Z', href: null,
  }];

  const rows = buildStaffOperationsReport(
    [{ staffId: 7, staffName: 'Ari' }, { staffId: 8, staffName: 'Bo' }],
    activity,
    active,
  );

  assert.deepEqual(rows, [
    {
      staffId: 7,
      staffName: 'Ari',
      pickCount: 1,
      packCount: 2,
      medianPickSeconds: 120,
      medianPackSeconds: 120,
      activeOperations: active,
    },
    {
      staffId: 8,
      staffName: 'Bo',
      pickCount: 0,
      packCount: 0,
      medianPickSeconds: null,
      medianPackSeconds: null,
      activeOperations: [],
    },
  ]);
});
