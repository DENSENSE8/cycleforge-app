import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeferredScanWork } from './deferred-scan-work';

function harness() {
  const tasks: Array<() => Promise<void>> = [];
  const errors: Array<{ label: string; receivingId: number }> = [];
  const work = createDeferredScanWork(
    (task) => tasks.push(task),
    (label, receivingId) => errors.push({ label, receivingId }),
  );
  return { work, tasks, errors };
}

test('invalidation and publish run only after every deferred write settled', async () => {
  const { work, tasks } = harness();
  const log: string[] = [];
  const followups = Promise.withResolvers<void>();
  const classification = Promise.withResolvers<void>();
  work.step('scan-followups', 7, async () => {
    await followups.promise;
    log.push('scan-followups');
  });
  work.whenSettled(async () => {
    log.push('invalidate+publish');
  });
  work.step('classification', 7, async () => {
    await classification.promise;
    log.push('classification');
  });

  assert.equal(tasks.length, 1, 'one scheduled task for the whole request');
  assert.deepEqual(log, [], 'nothing runs before the scheduled task does');
  const running = tasks[0]!();
  classification.resolve();
  await classification.promise;
  await Promise.resolve();
  assert.deepEqual(log, ['classification'], 'publish waits for the still-running step');
  followups.resolve();
  await running;
  assert.deepEqual(log, ['classification', 'scan-followups', 'invalidate+publish']);
});

test('a failed step is reported with its ids and skips no other step', async () => {
  const { work, tasks, errors } = harness();
  const log: string[] = [];
  work.step('tracking-exception', 9, async () => {
    throw new Error('exception upsert failed');
  });
  work.step('classification', 9, async () => {
    log.push('classification');
  });
  work.whenSettled(async () => {
    log.push('invalidate+publish');
  });

  await tasks[0]!();
  assert.deepEqual(errors, [{ label: 'tracking-exception', receivingId: 9 }]);
  assert.deepEqual(log, ['classification', 'invalidate+publish']);
});
