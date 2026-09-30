/**
 *   node --import tsx --test src/lib/task-board/task-board-model.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseTaskBoardStatus,
  sortTaskBoardRows,
  taskBoardDueFace,
  taskBoardProjects,
  taskBoardStatusMatches,
  taskBoardViewCounts,
  type TaskBoardRow,
} from './task-board-model';

function row(over: Partial<TaskBoardRow> & { key: string }): TaskBoardRow {
  return {
    source: 'task',
    id: 1,
    title: over.key,
    detail: null,
    project: null,
    done: false,
    status: 'OPEN',
    taskStatus: 'TODO',
    urgent: false,
    people: [],
    from: null,
    dueMs: null,
    ticket: null,
    repair: null,
    record: null,
    linkCount: 0,
    photoCount: 0,
    docCount: 0,
    team: null,
    cadence: null,
    createdMs: 0,
    lastFollowUpMs: null,
    nextFollowUpMs: null,
    ...over,
  };
}

describe('sortTaskBoardRows', () => {
  it('orders open before closed, then urgent, then nearest due, then newest', () => {
    const sorted = sortTaskBoardRows([
      row({ key: 'done', status: 'DONE', done: true, urgent: true }),
      row({ key: 'no-due-new', createdMs: 50 }),
      row({ key: 'no-due-old', createdMs: 10 }),
      row({ key: 'due-late', dueMs: 2_000 }),
      row({ key: 'due-soon', dueMs: 1_000 }),
      row({ key: 'urgent', urgent: true, dueMs: 9_000 }),
    ]);
    assert.deepEqual(
      sorted.map((r) => r.key),
      ['urgent', 'due-soon', 'due-late', 'no-due-new', 'no-due-old', 'done'],
    );
  });

  it('a scheduled next follow-up pulls a row up to its chase time, even past a later due date', () => {
    const sorted = sortTaskBoardRows([
      row({ key: 'due-1500', dueMs: 1_500 }),
      row({ key: 'chase-1000-due-9000', dueMs: 9_000, nextFollowUpMs: 1_000 }),
      row({ key: 'chase-only-2000', nextFollowUpMs: 2_000 }),
      row({ key: 'nothing', createdMs: 99 }),
    ]);
    assert.deepEqual(
      sorted.map((r) => r.key),
      ['chase-1000-due-9000', 'due-1500', 'chase-only-2000', 'nothing'],
    );
  });
});

describe('status and view membership', () => {
  it('a withdrawn task is neither open nor done', () => {
    const canceled = row({ key: 'c', status: 'CANCELED' });
    assert.equal(taskBoardStatusMatches(canceled, 'open'), false);
    assert.equal(taskBoardStatusMatches(canceled, 'done'), false);
    assert.equal(taskBoardStatusMatches(canceled, 'all'), true);
  });

  it('Waiting is open work on a hold; it stays in Open too, and finished work never waits', () => {
    const held = row({ key: 'held', status: 'IN_PROGRESS', taskStatus: 'BLOCKED' });
    const working = row({ key: 'working', status: 'IN_PROGRESS', taskStatus: 'IN_PROGRESS' });
    const done = row({ key: 'done', status: 'DONE', done: true, taskStatus: 'DONE' });
    assert.equal(taskBoardStatusMatches(held, 'waiting'), true);
    assert.equal(taskBoardStatusMatches(held, 'open'), true);
    assert.equal(taskBoardStatusMatches(working, 'waiting'), false);
    assert.equal(taskBoardStatusMatches(done, 'waiting'), false);
    assert.equal(parseTaskBoardStatus('waiting'), 'waiting');
    assert.equal(parseTaskBoardStatus('pending'), 'open', 'an unknown filter reads as the default');
  });

  it('a ticket or repair task counts as Support, not a plain task; closed rows never count', () => {
    const counts = taskBoardViewCounts([
      row({ key: 'plain' }),
      row({ key: 'ticket', ticket: { number: 48120, subject: null, status: null } }),
      row({ key: 'repair', repair: { id: 53, ticketNumber: 'RS-0053', status: 'Pending Repair' } }),
      row({ key: 'check', source: 'checklist', status: null, ticket: { number: 7, subject: null, status: null } }),
      row({ key: 'closed-ticket', status: 'DONE', done: true, ticket: { number: 1, subject: null, status: null } }),
    ]);
    assert.deepEqual(counts, { all: 4, task: 1, ticket: 3, checklist: 1, project: 0 });
  });
});

describe('taskBoardProjects', () => {
  it('rolls open/done, the nearest open due, and every member up per project, busiest first', () => {
    const ana = { id: 1, name: 'Ana' };
    const bo = { id: 2, name: 'Bo' };
    const projects = taskBoardProjects([
      row({ key: 'a1', project: 'Relist', people: [ana], dueMs: 5_000 }),
      row({ key: 'a2', project: 'Relist', people: [bo, ana], dueMs: 3_000 }),
      row({ key: 'a3', project: 'Relist', status: 'DONE', done: true, dueMs: 1_000 }),
      row({ key: 'a4', project: 'Relist', status: 'CANCELED' }),
      row({ key: 'b1', project: 'Audit' }),
    ]);
    assert.deepEqual(
      projects.map((p) => [p.name, p.open, p.done, p.nextDueMs, p.people.map((x) => x.name)]),
      [
        ['Relist', 2, 1, 3_000, ['Ana', 'Bo']],
        ['Audit', 1, 0, null, []],
      ],
    );
  });
});

describe('taskBoardDueFace', () => {
  // 2026-09-29 12:00 in Los Angeles (PDT, UTC-7).
  const noon = Date.parse('2026-09-29T19:00:00Z');
  it('reads late, today, tomorrow in the warehouse zone', () => {
    assert.equal(taskBoardDueFace(Date.parse('2026-09-27T19:00:00Z'), noon)?.label, '2d late');
    assert.equal(taskBoardDueFace(Date.parse('2026-09-29T18:00:00Z'), noon)?.tone, 'late');
    assert.equal(taskBoardDueFace(Date.parse('2026-09-30T00:00:00Z'), noon)?.label, 'Today 5:00 PM');
    // 23:30 UTC on the 30th is still the 30th in LA → tomorrow.
    assert.equal(taskBoardDueFace(Date.parse('2026-09-30T23:30:00Z'), noon)?.label, 'Tomorrow');
    assert.equal(taskBoardDueFace(null, noon), null);
  });
});
