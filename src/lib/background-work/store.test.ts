import assert from 'node:assert/strict';
import test, { after, before, mock } from 'node:test';
import { beginWork, cancelWork, FINISHED_TTL_MS, pauseWork, readWork, resumeWork, type WorkControl } from './store';

const CONTROLLABLE = { pause: true, cancel: true } as const;

// Settled rows prune on a timer: the clock is ours, so nothing waits on the wall.
before(() => mock.timers.enable({ apis: ['setTimeout'] }));
after(() => mock.timers.reset());

/** Whether the checkpoint has answered once every queued microtask has run. */
async function settled(promise: Promise<boolean>): Promise<boolean | 'held'> {
  let answer: boolean | 'held' = 'held';
  void promise.then((go) => {
    answer = go;
  });
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  return answer;
}

test('pause holds the next checkpoint until resume, and progress in flight still counts', async () => {
  const work = beginWork({ kind: 'print', label: 'FNSKU labels', total: 10, controls: CONTROLLABLE });
  assert.equal(await work.checkpoint(), true);
  work.progress(1, 10);

  pauseWork(work.id);
  assert.equal(readWork(work.id)?.status, 'paused');
  const held = work.checkpoint();
  // The label already on its way lands while paused.
  work.progress(2, 10);
  assert.equal(readWork(work.id)?.done, 2);
  assert.equal(await settled(held), 'held');

  resumeWork(work.id);
  assert.equal(readWork(work.id)?.status, 'running');
  assert.equal(await held, true);
  work.finish('10 printed');
});

test('cancel ends the item at once, releases a paused checkpoint with false, and the job names what printed', async () => {
  const work = beginWork({ kind: 'print', label: 'FNSKU labels', total: 10, controls: CONTROLLABLE });
  work.progress(4, 10);
  pauseWork(work.id);
  const held = work.checkpoint();
  cancelWork(work.id);
  assert.equal(await held, false);
  assert.equal(readWork(work.id)?.status, 'cancelled');
  assert.equal(await work.checkpoint(), false);

  work.cancelled('Cancelled · 4 of 10 printed');
  // A finish after the cancel cannot resurrect it.
  work.finish('10 printed');
  const item = readWork(work.id);
  assert.equal(item?.status, 'cancelled');
  assert.equal(item?.message, 'Cancelled · 4 of 10 printed');
  assert.equal(item?.done, 4);
  assert.ok(item?.endedAt);
  // A cancelled row lingers like any finished one, then leaves.
  mock.timers.tick(FINISHED_TTL_MS);
  assert.equal(readWork(work.id), undefined);
});

test('a job without controls ignores pause and cancel', async () => {
  const work = beginWork({ kind: 'print', label: 'Labels', total: 3 });
  pauseWork(work.id);
  cancelWork(work.id);
  assert.equal(readWork(work.id)?.status, 'running');
  assert.equal(await work.checkpoint(), true);

  const pauseOnly = beginWork({ kind: 'print', label: 'Labels', total: 3, controls: { pause: true, cancel: false } });
  cancelWork(pauseOnly.id);
  assert.equal(readWork(pauseOnly.id)?.status, 'running');
  work.finish();
  pauseOnly.finish();
});

test('controls relay to the job printing elsewhere; a mirrored pause relays nothing back', () => {
  const relayed: WorkControl[] = [];
  const work = beginWork({
    kind: 'print',
    label: 'FNSKU labels → Bench',
    total: 10,
    controls: CONTROLLABLE,
    onControl: (control) => relayed.push(control),
  });
  pauseWork(work.id);
  pauseWork(work.id); // already paused: nothing to send
  resumeWork(work.id);
  work.setPaused(true); // the station reports it paused itself
  assert.equal(readWork(work.id)?.status, 'paused');
  work.setPaused(false);
  cancelWork(work.id);
  cancelWork(work.id); // already cancelled: nothing to send
  assert.deepEqual(relayed, ['pause', 'resume', 'cancel']);
});

test('a paused item still closes on finish, and its held checkpoint goes on', async () => {
  const work = beginWork({ kind: 'print', label: 'Labels', total: 2, controls: CONTROLLABLE });
  pauseWork(work.id);
  const held = work.checkpoint();
  work.finish('Sent to Bench');
  assert.equal(await held, true);
  assert.equal(readWork(work.id)?.status, 'done');
});
