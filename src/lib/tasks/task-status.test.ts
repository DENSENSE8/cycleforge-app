/** The ONE task status over its two stored columns — mapping, parse, transitions. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { matchTaskStatuses, taskStatusSliderIndex } from '@/design-system/tokens/task-status';
import { applyTaskStatusPatch, taskStatusFromStored, taskStatusOf, taskStatusPatch } from './task-status';

test('a hold outranks the open lifecycle; closing outranks the hold', () => {
  assert.equal(taskStatusOf({ status: 'OPEN', taskState: null }), 'TODO');
  assert.equal(taskStatusOf({ status: 'ASSIGNED', taskState: null }), 'TODO');
  assert.equal(taskStatusOf({ status: 'IN_PROGRESS', taskState: null }), 'IN_PROGRESS');
  assert.equal(taskStatusOf({ status: 'IN_PROGRESS', taskState: 'BLOCKED' }), 'BLOCKED');
  assert.equal(taskStatusOf({ status: 'ASSIGNED', taskState: 'PENDING' }), 'PENDING');
  // A stale hold on closed work (the trigger clears it; a pre-image may not) never paints.
  assert.equal(taskStatusOf({ status: 'DONE', taskState: 'FOLLOW_UP' }), 'DONE');
  assert.equal(taskStatusOf({ status: 'CANCELED', taskState: 'PENDING' }), 'CANCELED');
});

test('stored audit text reads as the status; OPEN → ASSIGNED is no change; unknown lifecycle is null', () => {
  assert.equal(taskStatusFromStored('OPEN', undefined), 'TODO');
  assert.equal(taskStatusFromStored('ASSIGNED', null), 'TODO');
  assert.equal(taskStatusFromStored('OPEN', 'FOLLOW_UP'), 'FOLLOW_UP');
  assert.equal(taskStatusFromStored('OPEN', 'SNOOZED'), 'TODO', 'a hold outside the vocabulary reads as none');
  assert.equal(taskStatusFromStored('PAUSED', null), null);
  assert.equal(taskStatusFromStored(null, 'PENDING'), null);
});

test('a hold on open work leaves the lifecycle alone; on closed work it reopens in the same write', () => {
  assert.deepEqual(taskStatusPatch({ status: 'IN_PROGRESS', taskState: null }, 'PENDING'), { taskState: 'PENDING' });
  assert.deepEqual(taskStatusPatch({ status: 'OPEN', taskState: 'PENDING' }, 'BLOCKED'), { taskState: 'BLOCKED' });
  assert.deepEqual(taskStatusPatch({ status: 'DONE', taskState: null }, 'FOLLOW_UP'), { status: 'OPEN', taskState: 'FOLLOW_UP' });
});

test('leaving a hold clears it; a status write names task_state only when a hold is involved', () => {
  assert.deepEqual(taskStatusPatch({ status: 'OPEN', taskState: 'PENDING' }, 'TODO'), { taskState: null });
  assert.deepEqual(taskStatusPatch({ status: 'IN_PROGRESS', taskState: 'BLOCKED' }, 'TODO'), { status: 'OPEN', taskState: null });
  assert.deepEqual(taskStatusPatch({ status: 'OPEN', taskState: 'PENDING' }, 'DONE'), { status: 'DONE', taskState: null });
  // Pre-migration safety: no hold anywhere → the patch never carries the column.
  assert.deepEqual(taskStatusPatch({ status: 'OPEN', taskState: null }, 'DONE'), { status: 'DONE' });
  assert.deepEqual(taskStatusPatch({ status: 'IN_PROGRESS', taskState: null }, 'TODO'), { status: 'OPEN' });
  assert.deepEqual(taskStatusPatch({ status: 'DONE', taskState: null }, 'IN_PROGRESS'), { status: 'IN_PROGRESS' });
});

test('no write for the same status or out of Canceled', () => {
  assert.equal(taskStatusPatch({ status: 'ASSIGNED', taskState: null }, 'TODO'), null);
  assert.equal(taskStatusPatch({ status: 'CANCELED', taskState: null }, 'TODO'), null);
  assert.equal(taskStatusPatch({ status: 'CANCELED', taskState: null }, 'PENDING'), null);
  assert.deepEqual(taskStatusPatch({ status: 'OPEN', taskState: 'BLOCKED' }, 'CANCELED'), { status: 'CANCELED', taskState: null });
});

test('the optimistic apply drops a hold the moment the status closes, as the trigger does', () => {
  assert.deepEqual(applyTaskStatusPatch({ status: 'OPEN', taskState: 'PENDING' }, { status: 'DONE' }), { status: 'DONE', taskState: null });
  assert.deepEqual(applyTaskStatusPatch({ status: 'DONE', taskState: null }, { status: 'OPEN', taskState: 'BLOCKED' }), {
    status: 'OPEN',
    taskState: 'BLOCKED',
  });
  assert.deepEqual(applyTaskStatusPatch({ status: 'IN_PROGRESS', taskState: 'PENDING' }, { status: 'ASSIGNED' }), {
    status: 'ASSIGNED',
    taskState: 'PENDING',
  });
});

test('combobox filter: typed words, a letter alone, aliases', () => {
  assert.equal(matchTaskStatuses('pen')[0], 'PENDING');
  assert.equal(matchTaskStatuses('p')[0], 'PENDING', 'a letter alone ranks its status first');
  assert.equal(matchTaskStatuses('d')[0], 'DONE');
  assert.equal(matchTaskStatuses('up')[0], 'FOLLOW_UP', 'a word start inside a hyphenated label');
  assert.equal(matchTaskStatuses('parts')[0], 'BLOCKED');
  assert.equal(matchTaskStatuses('doing')[0], 'IN_PROGRESS', 'the old label still finds its status');
  assert.deepEqual(matchTaskStatuses('zzz'), []);
  assert.equal(matchTaskStatuses('').length, 7);
});

test('slider: active work reads Not done, any hold reads Pending, Canceled is off the scale', () => {
  assert.equal(taskStatusSliderIndex('TODO'), 0);
  assert.equal(taskStatusSliderIndex('IN_PROGRESS'), 0);
  assert.equal(taskStatusSliderIndex('PENDING'), 1);
  assert.equal(taskStatusSliderIndex('BLOCKED'), 1);
  assert.equal(taskStatusSliderIndex('DONE'), 2);
  assert.equal(taskStatusSliderIndex('CANCELED'), null);
});
