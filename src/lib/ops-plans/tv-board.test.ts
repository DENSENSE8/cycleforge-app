import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTvBoard, TV_BOARD_LANE_LIMIT } from './tv-board';
import type { PlanRow, TaskRow } from './types';
import { MASTER_PLAN_OPS_TITLE, CONNECTIONS_ADOPTION_OPS_TITLE } from '@/lib/master-plan/ops-plans-bridge-constants';

// Fixed civil-day window (injected — the aggregator never reads the clock, so
// these tests are deterministic under any TZ).
const DAY_START = Date.parse('2026-07-12T07:00:00.000Z'); // PDT midnight
const DAY_END = Date.parse('2026-07-13T06:59:59.999Z');
const DATE_KEY = '2026-07-12';
const GENERATED_AT = '2026-07-12T18:30:00.000Z';

function task(partial: Partial<TaskRow> & Pick<TaskRow, 'id' | 'title' | 'status'>): TaskRow {
  return {
    phaseId: 'phase-1',
    planId: 'plan-1',
    planTitle: 'Floor plan',
    station: 'TECH',
    assigneeStaffId: null,
    assigneeName: null,
    dueAt: null,
    startedAt: null,
    completedAt: null,
    completedByStaffId: null,
    notes: null,
    sortOrder: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...partial,
  };
}

function plan(partial: Partial<PlanRow> & Pick<PlanRow, 'id' | 'title'>): PlanRow {
  return {
    description: null,
    status: 'active',
    targetDate: null,
    createdByStaffId: null,
    createdByName: null,
    archivedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    progress: { planId: partial.id, totalTasks: 0, doneTasks: 0, canceledTasks: 0, percentComplete: 0, byStation: [] },
    ...partial,
  };
}

function build(tasks: TaskRow[], plans: PlanRow[] = []) {
  return buildTvBoard({ tasks, plans, dayStartMs: DAY_START, dayEndMs: DAY_END, dateKey: DATE_KEY, generatedAt: GENERATED_AT });
}

test('classifies due-today, overdue, unscheduled, and future tasks into the right lanes', () => {
  const board = build([
    task({ id: 't-overdue', title: 'Overdue', status: 'open', dueAt: '2026-07-10T20:00:00.000Z' }), // 2 days before start
    task({ id: 't-today', title: 'Due today', status: 'in_progress', dueAt: '2026-07-12T20:00:00.000Z' }),
    task({ id: 't-null', title: 'No due date', status: 'open', dueAt: null }),
    task({ id: 't-future', title: 'Future', status: 'open', dueAt: '2026-07-20T20:00:00.000Z' }),
  ]);

  assert.deepEqual(board.dueToday.map((t) => t.id), ['t-today']);
  assert.deepEqual(board.overdue.map((t) => t.id), ['t-overdue']);
  assert.equal(board.counts.dueToday, 1);
  assert.equal(board.counts.overdue, 1);
  assert.equal(board.counts.unscheduled, 1);
  assert.equal(board.counts.inProgress, 1);
  assert.equal(board.counts.open, 4); // all four are open/in_progress
  // Future + unscheduled never appear in a lane.
  const laneIds = [...board.dueToday, ...board.overdue].map((t) => t.id);
  assert.ok(!laneIds.includes('t-future') && !laneIds.includes('t-null'));
});

test('overdue daysLate counts whole civil-days before today (≥1), due-today is 0', () => {
  const board = build([
    task({ id: 'a', title: 'A', status: 'open', dueAt: '2026-07-11T23:00:00.000Z' }), // ~8h before start → 1
    task({ id: 'b', title: 'B', status: 'open', dueAt: '2026-07-09T12:00:00.000Z' }), // ~2.8d before → 3
    task({ id: 'c', title: 'C', status: 'open', dueAt: '2026-07-12T12:00:00.000Z' }), // due today
  ]);
  assert.equal(board.overdue.find((t) => t.id === 'a')!.daysLate, 1);
  assert.equal(board.overdue.find((t) => t.id === 'b')!.daysLate, 3);
  assert.equal(board.dueToday.find((t) => t.id === 'c')!.daysLate, 0);
});

test('drops done/canceled tasks entirely', () => {
  const board = build([
    task({ id: 'done', title: 'Done', status: 'done', dueAt: '2026-07-10T20:00:00.000Z' }),
    task({ id: 'canceled', title: 'Canceled', status: 'canceled', dueAt: '2026-07-12T12:00:00.000Z' }),
  ]);
  assert.equal(board.counts.open, 0);
  assert.equal(board.overdue.length, 0);
  assert.equal(board.dueToday.length, 0);
});

test('by-station tallies every canonical station and labels agentic (ADMIN) tickets', () => {
  const board = build([
    task({ id: 'r1', title: 'Recv', status: 'open', station: 'RECEIVING' }),
    task({ id: 'p1', title: 'Pack', status: 'in_progress', station: 'PACK' }),
    task({ id: 'p2', title: 'Pack overdue', status: 'open', station: 'PACK', dueAt: '2026-07-10T20:00:00.000Z' }),
    task({ id: 'ad', title: 'Bridged ticket', status: 'open', station: 'ADMIN', planTitle: MASTER_PLAN_OPS_TITLE }),
  ]);
  const by = Object.fromEntries(board.byStation.map((s) => [s.station, s]));
  // All six canonical stations render even at zero.
  assert.deepEqual(board.byStation.map((s) => s.station), ['RECEIVING', 'TECH', 'PACK', 'FBA', 'LABELS', 'ADMIN']);
  assert.equal(by.RECEIVING.open, 1);
  assert.equal(by.PACK.open, 2);
  assert.equal(by.PACK.inProgress, 1);
  assert.equal(by.PACK.overdue, 1);
  assert.equal(by.ADMIN.open, 1);
  assert.equal(by.ADMIN.agentic, 1); // bridged product ticket flagged
  assert.equal(by.FBA.open, 0);
});

test('caps each task lane at the lane limit but keeps full counts', () => {
  const overdue = Array.from({ length: TV_BOARD_LANE_LIMIT + 5 }, (_, i) =>
    task({ id: `o-${i}`, title: `O${i}`, status: 'open', dueAt: '2026-07-10T20:00:00.000Z' }),
  );
  const board = build(overdue);
  assert.equal(board.overdue.length, TV_BOARD_LANE_LIMIT);
  assert.equal(board.counts.overdue, TV_BOARD_LANE_LIMIT + 5);
});

test('passes through plan progress and classifies plan source', () => {
  const board = build([], [
    plan({ id: 'plan-a', title: MASTER_PLAN_OPS_TITLE, progress: { planId: 'plan-a', totalTasks: 10, doneTasks: 4, canceledTasks: 0, percentComplete: 40, byStation: [] } }),
    plan({ id: 'plan-b', title: CONNECTIONS_ADOPTION_OPS_TITLE, progress: { planId: 'plan-b', totalTasks: 8, doneTasks: 8, canceledTasks: 0, percentComplete: 100, byStation: [] } }),
    plan({ id: 'plan-c', title: 'Q3 receiving revamp', progress: { planId: 'plan-c', totalTasks: 5, doneTasks: 1, canceledTasks: 0, percentComplete: 20, byStation: [] } }),
  ]);
  assert.deepEqual(board.plans.map((p) => [p.source, p.percentComplete, p.done, p.total]), [
    ['agentic', 40, 4, 10],
    ['adoption', 100, 8, 8],
    ['authored', 20, 1, 5],
  ]);
});

test('echoes injected dateKey / generatedAt (no clock read)', () => {
  const board = build([]);
  assert.equal(board.dateKey, DATE_KEY);
  assert.equal(board.generatedAt, GENERATED_AT);
});
