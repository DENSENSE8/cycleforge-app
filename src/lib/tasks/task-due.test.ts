import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateToDateKey } from '@/utils/date';
import { TASK_DUE_PRESETS, taskDueDay, taskDueInstantIso } from './task-due';

test('a picked day saves as 17:00 warehouse time on that civil day', () => {
  // Oct 4 2026 is PDT (UTC-7): 17:00 local = 00:00Z next day.
  assert.equal(taskDueInstantIso(new Date(2026, 9, 4)), '2026-10-05T00:00:00.000Z');
  // Dec 4 2026 is PST (UTC-8): 17:00 local = 01:00Z next day.
  assert.equal(taskDueInstantIso(new Date(2026, 11, 4)), '2026-12-05T01:00:00.000Z');
});

test('the stored instant reads back as its warehouse civil day, not the UTC day', () => {
  assert.equal(localDateToDateKey(taskDueDay(Date.parse('2026-10-01T00:00:00.000Z'))), '2026-09-30');
  assert.equal(taskDueDay(null), undefined);
});

test('pick → store → read is the same day', () => {
  const day = new Date(2026, 2, 8); // the spring-forward day
  const iso = taskDueInstantIso(day);
  assert.ok(iso);
  assert.equal(localDateToDateKey(taskDueDay(Date.parse(iso))), '2026-03-08');
});

test('presets are Today · Tomorrow · Next week, a day and a week apart', () => {
  assert.deepEqual(
    TASK_DUE_PRESETS.map((p) => p.label),
    ['Today', 'Tomorrow', 'Next week'],
  );
  const [today, tomorrow, nextWeek] = TASK_DUE_PRESETS.map((p) => p.day().getTime());
  const days = (ms: number) => Math.round(ms / 86_400_000);
  assert.equal(days(tomorrow - today), 1);
  assert.equal(days(nextWeek - today), 7);
});
