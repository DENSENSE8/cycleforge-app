import test from 'node:test';
import assert from 'node:assert/strict';
import { PomodoroCommand, PomodoroReportQuery, PomodoroTarget } from './contract';

test('civil checklist identity rejects impossible dates and foreign identity fields', () => {
  assert.equal(PomodoroTarget.safeParse({ kind: 'checklist', id: 4, date: '2026-02-29' }).success, false);
  assert.equal(PomodoroTarget.safeParse({ kind: 'checklist', id: 4, date: '2024-02-29' }).success, true);
  assert.equal(PomodoroCommand.safeParse({
    kind: 'task', id: 3, action: 'start', staffId: 5,
  }).success, false);
  assert.equal(PomodoroCommand.safeParse({
    kind: 'checklist', id: 3, date: '2026-09-25', action: 'pause', organizationId: 'foreign',
  }).success, false);
});

test('view requires stable UUID; timer controls cannot forge event identifier', () => {
  const view = { kind: 'task', id: 8, action: 'view' };
  assert.equal(PomodoroCommand.safeParse(view).success, false);
  assert.equal(PomodoroCommand.safeParse({ ...view, clientEventId: '11111111-1111-4111-8111-111111111111' }).success, true);
  assert.equal(PomodoroCommand.safeParse({ ...view, clientEventId: 'reused tab' }).success, false);
  assert.equal(PomodoroCommand.safeParse({ ...view, action: 'start', clientEventId: '11111111-1111-4111-8111-111111111111' }).success, false);
});

test('manager report range bounds and staff filter remain validated', () => {
  assert.equal(PomodoroReportQuery.safeParse({ from: '2026-11-01', to: '2026-12-01' }).success, true);
  assert.equal(PomodoroReportQuery.safeParse({ from: '2026-11-01', to: '2026-12-02' }).success, false);
  assert.equal(PomodoroReportQuery.safeParse({ from: '2026-11-02', to: '2026-11-01' }).success, false);
  assert.equal(PomodoroReportQuery.safeParse({ from: '2026-11-01', to: '2026-11-01', staffId: -5 }).success, false);
});
