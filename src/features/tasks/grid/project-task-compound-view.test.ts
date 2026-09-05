import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectTaskCompoundView } from './project-task-compound-view';
import type { TaskRow } from '@/lib/ops-plans/types';

const NOW = Date.parse('2026-09-04T12:00:00.000Z');

function task(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    phaseId: '22222222-2222-4222-8222-222222222222',
    planId: '33333333-3333-4333-8333-333333333333',
    planTitle: 'Q3 inbound',
    station: 'ADMIN',
    title: 'Assign Lien to carton photos',
    assigneeStaffId: 7,
    assigneeName: 'Lien',
    status: 'open',
    dueAt: '2026-09-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    completedByStaffId: null,
    notes: null,
    sortOrder: 100,
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...over,
  };
}

test('project task compound view titles the task and notes project · assignee', () => {
  const view = projectTaskCompoundView(task(), { nowMs: NOW });
  assert.equal(view.title, 'Assign Lien to carton photos');
  assert.equal(view.note, 'Q3 inbound · Lien');
  assert.equal(view.stateLabel, 'Open');
  assert.equal(view.delay?.overdue, true);
});

test('done tasks do not report delay', () => {
  const view = projectTaskCompoundView(task({ status: 'done' }), { nowMs: NOW });
  assert.equal(view.stateTone, 'done');
  assert.equal(view.delay, null);
});
