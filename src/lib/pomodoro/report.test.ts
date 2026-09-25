import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPomodoroReport, loadPomodoroReport, type ActivityRow, type SessionDayRow } from './report';

const ORG = '11111111-1111-4111-8111-111111111111';
const args = { orgId: ORG, from: '2026-11-01', to: '2026-11-02' };
const at = (timestamp: string) => new Date(timestamp);

function taskEvent(eventId: string, event: ActivityRow['event_type'], date: string, timestamp: string, staff = 7): ActivityRow {
  return {
    event_id: eventId, staff_id: staff, staff_name: staff === 7 ? 'Avery' : 'Robin',
    assignment_id: 41, daily_check_item_id: null,
    check_date: null, event_day: date, event_type: event, source: 'task_status',
    occurred_at: at(timestamp), duration_ms: null, title: '# Fix **return label**',
    target_entity_type: 'ORDER', target_entity_id: 92,
    lifecycle_started_at: at('2026-11-01T08:00:00.000Z'),
  };
}

test('manager report separates per-day measured focus from wall-clock lifecycle and actor', () => {
  const activity = [
    taskEvent('activity:1', 'viewed', '2026-11-01', '2026-11-01T08:05:00.000Z'),
    taskEvent('activity:2', 'worked', '2026-11-01', '2026-11-01T08:06:00.000Z'),
    taskEvent('activity:3', 'completed', '2026-11-02', '2026-11-02T09:00:00.000Z', 8),
  ];
  const sessions: SessionDayRow[] = [
    { staff_id: 7, staff_name: 'Avery', assignment_id: 41, daily_check_item_id: null, check_date: null,
      event_day: '2026-11-01', duration_ms: '725000', title: 'Fix return label',
      target_entity_type: 'ORDER', target_entity_id: 92 },
    { staff_id: 7, staff_name: 'Avery', assignment_id: 41, daily_check_item_id: null, check_date: null,
      event_day: '2026-11-02', duration_ms: '430000', title: 'Fix return label',
      target_entity_type: 'ORDER', target_entity_id: 92 },
  ];
  const report = buildPomodoroReport(args, activity, sessions);
  const day1 = report.rows.find((row) => row.staffId === 7 && row.date === '2026-11-01')!;
  const day2 = report.rows.find((row) => row.staffId === 7 && row.date === '2026-11-02')!;
  const completed = report.rows.find((row) => row.staffId === 8 && row.date === '2026-11-02')!;
  assert.equal(day1.measuredFocusSeconds, 725);
  assert.equal(day2.measuredFocusSeconds, 430);
  assert.equal(completed.measuredFocusSeconds, 0);
  assert.deepEqual(report.taskLifecycles, [{
    taskId: 41, date: '2026-11-02',
    startedAt: '2026-11-01T08:00:00.000Z',
    completedAt: '2026-11-02T09:00:00.000Z',
    elapsedSeconds: 25 * 3600,
  }]);
  assert.equal('lifecycleElapsedSeconds' in completed, false);
  assert.deepEqual(completed.completedAt, ['2026-11-02T09:00:00.000Z']);
  assert.deepEqual([completed.title, completed.targetEntityType, completed.targetEntityId],
    ['Fix return label', 'order', 92]);
  assert.equal(report.events[0].eventId, 'activity:1');
});

test('checklist completion without focus is still attributed to staff and date instance', () => {
  const report = buildPomodoroReport(args, [{
    event_id: 'activity:8', staff_id: 9, staff_name: 'Taylor',
    assignment_id: null, daily_check_item_id: 5,
    check_date: '2026-10-31', event_day: '2026-11-01', event_type: 'completed',
    source: 'checklist_mark', occurred_at: at('2026-11-01T10:00:00Z'), duration_ms: null,
    title: 'Open counter', target_entity_type: null, target_entity_id: null,
    lifecycle_started_at: null,
  }], []);
  assert.equal(report.rows[0].date, '2026-11-01');
  assert.equal(report.rows[0].checkDate, '2026-10-31');
  assert.equal(report.rows[0].measuredFocusSeconds, 0);
  assert.deepEqual(report.taskLifecycles, []);
  assert.deepEqual(report.rows[0].completedAt, ['2026-11-01T10:00:00.000Z']);
  assert.equal(report.events[0].durationSeconds, null);
});

test('report fetches tenant-filtered activity and session days from injected collaborators', async () => {
  const calls: Array<{ from: string; to: string; orgId: string; staffId?: number }> = [];
  const result = await loadPomodoroReport({ ...args, staffId: 12 }, {
    fetchActivity: async (input) => { calls.push(input); return []; },
    fetchSessionDays: async (input) => { calls.push(input); return []; },
  });
  assert.equal(result.rows.length, 0);
  assert.deepEqual(calls, [{ ...args, staffId: 12 }, { ...args, staffId: 12 }]);
});
