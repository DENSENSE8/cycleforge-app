import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import {
  beginOptimisticUpdate,
  mutationErrorMessage,
  restoreSnapshots,
  snapshotAndPatch,
} from './apply-optimistic-cache';

const KEY = ['ticket', 7] as const;

test('snapshotAndPatch paints the new value and keeps the previous for rollback', () => {
  const qc = new QueryClient();
  qc.setQueryData(KEY, { id: 7, subject: 'Old' });

  const snaps = snapshotAndPatch(
    qc,
    [
      {
        queryKey: KEY,
        update: (current: { id: number; subject: string } | undefined, vars: { subject: string }) =>
          current ? { ...current, subject: vars.subject } : current,
      },
    ],
    { subject: 'New' },
  );

  assert.deepEqual(qc.getQueryData(KEY), { id: 7, subject: 'New' });
  assert.equal(snaps.length, 1);
  assert.deepEqual(snaps[0].previous, { id: 7, subject: 'Old' });
});

test('restoreSnapshots puts the snapshot back — the failure path', () => {
  const qc = new QueryClient();
  qc.setQueryData(KEY, { id: 7, subject: 'Old' });
  const snaps = snapshotAndPatch(
    qc,
    [
      {
        queryKey: KEY,
        update: (current: { subject: string } | undefined) =>
          current ? { ...current, subject: 'New' } : current,
      },
    ],
    {},
  );
  restoreSnapshots(qc, snaps);
  assert.deepEqual(qc.getQueryData(KEY), { id: 7, subject: 'Old' });
});

test('beginOptimisticUpdate cancels in-flight reads on the key before patching', async () => {
  const qc = new QueryClient();
  qc.setQueryData(KEY, { n: 1 });
  await beginOptimisticUpdate(
    qc,
    [{ queryKey: KEY, update: (c: { n: number } | undefined) => (c ? { n: c.n + 1 } : c) }],
    undefined,
  );
  assert.deepEqual(qc.getQueryData(KEY), { n: 2 });
});

test('match: prefix patches every query under the key, not only the exact key', () => {
  const qc = new QueryClient();
  const listA = ['dashboard-table', 'unshipped', { q: 'a' }] as const;
  const listB = ['dashboard-table', 'unshipped', { q: 'b' }] as const;
  qc.setQueryData(listA, [{ id: 1, ship_by_date: '2026-01-01' }]);
  qc.setQueryData(listB, [{ id: 1, ship_by_date: '2026-01-01' }]);
  qc.setQueryData(['other'], [{ id: 1, ship_by_date: '2026-01-01' }]);

  snapshotAndPatch(
    qc,
    [
      {
        queryKey: ['dashboard-table'],
        match: 'prefix',
        update: (current: Array<{ id: number; ship_by_date: string }> | undefined, vars: { date: string }) =>
          current?.map((row) => (row.id === 1 ? { ...row, ship_by_date: vars.date } : row)),
      },
    ],
    { date: '2026-09-01' },
  );

  assert.deepEqual(qc.getQueryData(listA), [{ id: 1, ship_by_date: '2026-09-01' }]);
  assert.deepEqual(qc.getQueryData(listB), [{ id: 1, ship_by_date: '2026-09-01' }]);
  assert.deepEqual(qc.getQueryData(['other']), [{ id: 1, ship_by_date: '2026-01-01' }]);
});

test('mutationErrorMessage prefers the Error message the server threw', () => {
  assert.equal(mutationErrorMessage(new Error('Subject is required')), 'Subject is required');
  assert.equal(mutationErrorMessage('nope'), 'Update failed');
  assert.equal(mutationErrorMessage(new Error('  ')), 'Update failed');
});
