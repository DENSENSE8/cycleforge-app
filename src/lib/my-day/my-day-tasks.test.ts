import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkOrderRow } from '@/components/work-orders/types';
import {
  filterMyDayTasksByHorizon,
  myDayDueHorizon,
  myDayDueHorizonCounts,
  myDayTasksFromFeed,
  searchMyDayTasks,
  type MyDayTask,
} from './my-day-tasks';
import type { MyDayFeed, MyDayInterrupt } from './my-day-types';

/**
 * Read-model tests for the Today spreadsheet's two derived facets: the chrome
 * search predicate and the KPI band's due horizon.
 *
 * The horizon half MUST pass under `TZ=UTC` — it compares CIVIL DAYS in the
 * warehouse zone, and a host-local comparison would put an operator outside
 * America/Los_Angeles on a different day than the floor
 * (`source-of-truth.md` → Dates & times). The deadlines below are chosen so the
 * UTC day and the Pacific day genuinely differ.
 */

function workOrder(over: Partial<WorkOrderRow> & { id: string }): WorkOrderRow {
  return {
    title: 'Untitled',
    subtitle: '',
    queueLabel: 'Orders',
    recordLabel: null,
    orderId: null,
    status: 'pending',
    deadlineAt: null,
    updatedAt: null,
    assignedAt: null,
    ...over,
  } as WorkOrderRow;
}

function task(over: Partial<MyDayTask> & { id: string }): MyDayTask {
  return {
    lane: 'assigned',
    title: 'Untitled',
    subtitle: '',
    queueLabel: 'Orders',
    recordLabel: null,
    href: '/',
    status: null,
    deadlineAt: null,
    updatedAt: null,
    source: { kind: 'work_order', row: workOrder({ id: over.id }) },
    ...over,
  };
}

test('searchMyDayTasks matches title, subtitle, queue and record', () => {
  const tasks = [
    task({ id: 'a', title: 'Pack the amplifier' }),
    task({ id: 'b', subtitle: 'Awaiting a serial from the bench' }),
    task({ id: 'c', queueLabel: 'Testing' }),
    task({ id: 'd', recordLabel: '#4821' }),
    task({ id: 'e', title: 'Nothing relevant' }),
  ];

  assert.deepEqual(searchMyDayTasks(tasks, 'amplifier').map((t) => t.id), ['a']);
  assert.deepEqual(searchMyDayTasks(tasks, 'serial').map((t) => t.id), ['b']);
  assert.deepEqual(searchMyDayTasks(tasks, 'testing').map((t) => t.id), ['c']);
  assert.deepEqual(searchMyDayTasks(tasks, '4821').map((t) => t.id), ['d']);
});

test('searchMyDayTasks is case-insensitive and ignores surrounding space', () => {
  const tasks = [task({ id: 'a', title: 'Pack the Amplifier' })];
  assert.equal(searchMyDayTasks(tasks, '  AMPLIFIER  ').length, 1);
});

test('an empty query is not a filter — it returns everything', () => {
  const tasks = [task({ id: 'a' }), task({ id: 'b' })];
  assert.equal(searchMyDayTasks(tasks, '').length, 2);
  assert.equal(searchMyDayTasks(tasks, '   ').length, 2);
});

/**
 * The lane is the TAB strip's job, so typing a lane name must not silently do
 * the tab's work with a different predicate — that is the tabs-vs-facets
 * boundary in `display/workbench.md`.
 */
test('searchMyDayTasks does not match the lane or the status vocabulary', () => {
  const tasks = [task({ id: 'a', lane: 'attention', status: 'blocked', title: 'Ship it' })];
  assert.equal(searchMyDayTasks(tasks, 'attention').length, 0);
  assert.equal(searchMyDayTasks(tasks, 'blocked').length, 0);
});

test('myDayDueHorizon splits on the WAREHOUSE civil day, not the host day', () => {
  // 2026-08-01T05:00Z is still 2026-07-31 in America/Los_Angeles (UTC-7). A
  // host-local comparison under TZ=UTC would call this "today"; the floor's day
  // says it is already overdue.
  const todayKey = '2026-08-01';
  assert.equal(
    myDayDueHorizon(task({ id: 'a', deadlineAt: '2026-08-01T05:00:00.000Z' }), todayKey),
    'overdue',
  );
  // 18:00Z on the same date IS 2026-08-01 in Pacific.
  assert.equal(
    myDayDueHorizon(task({ id: 'b', deadlineAt: '2026-08-01T18:00:00.000Z' }), todayKey),
    'due_today',
  );
  assert.equal(
    myDayDueHorizon(task({ id: 'c', deadlineAt: '2026-08-03T18:00:00.000Z' }), todayKey),
    'upcoming',
  );
});

/**
 * Undated is its own answer. Folding an interrupt into `upcoming` would claim a
 * due date the record does not have — the band measures the dated half of the
 * day and says so.
 */
test('a task with no deadline has NO horizon and counts toward no tile', () => {
  const undated = task({ id: 'a', deadlineAt: null });
  assert.equal(myDayDueHorizon(undated, '2026-08-01'), null);

  const counts = myDayDueHorizonCounts([undated], '2026-08-01');
  assert.deepEqual(counts, { overdue: 0, due_today: 0, upcoming: 0 });
});

test('myDayDueHorizonCounts totals each horizon independently', () => {
  const todayKey = '2026-08-01';
  const counts = myDayDueHorizonCounts(
    [
      task({ id: 'a', deadlineAt: '2026-07-30T18:00:00.000Z' }),
      task({ id: 'b', deadlineAt: '2026-07-31T18:00:00.000Z' }),
      task({ id: 'c', deadlineAt: '2026-08-01T18:00:00.000Z' }),
      task({ id: 'd', deadlineAt: '2026-08-05T18:00:00.000Z' }),
      task({ id: 'e', deadlineAt: null }),
    ],
    todayKey,
  );
  assert.deepEqual(counts, { overdue: 2, due_today: 1, upcoming: 1 });
});

/**
 * The band promises what clicking it delivers: each tile's count must equal the
 * length of the list its filter produces over the same input.
 */
test('every tile count equals the row count its filter yields', () => {
  const todayKey = '2026-08-01';
  const tasks = [
    task({ id: 'a', deadlineAt: '2026-07-30T18:00:00.000Z' }),
    task({ id: 'b', deadlineAt: '2026-08-01T18:00:00.000Z' }),
    task({ id: 'c', deadlineAt: '2026-08-09T18:00:00.000Z' }),
    task({ id: 'd', deadlineAt: null }),
  ];
  const counts = myDayDueHorizonCounts(tasks, todayKey);

  for (const horizon of ['overdue', 'due_today', 'upcoming'] as const) {
    assert.equal(
      filterMyDayTasksByHorizon(tasks, horizon, todayKey).length,
      counts[horizon],
      `${horizon}: the tile count and its filter disagree`,
    );
  }
  // A null horizon is "not filtering", not "the undated bucket".
  assert.equal(filterMyDayTasksByHorizon(tasks, null, todayKey).length, 4);
});

test('myDayTasksFromFeed keeps the feed ranking: do next → assigned → interrupts', () => {
  const feed: MyDayFeed = {
    doNext: workOrder({ id: 'wo-next', title: 'Next' }),
    assigned: [workOrder({ id: 'wo-1', title: 'Mine' })],
    interrupts: [
      {
        id: 'int-1',
        kind: 'support_followup',
        title: 'Reply',
        subtitle: '',
        href: '/support',
        createdAtMs: 0,
        ticketId: 42,
      } satisfies MyDayInterrupt,
    ],
    queueCards: [],
    counts: { assigned: 1, interrupts: 1, unassigned: 0 },
  };

  assert.deepEqual(
    myDayTasksFromFeed(feed).map((t) => [t.id, t.lane]),
    [
      ['wo-next', 'do_next'],
      ['wo-1', 'assigned'],
      ['int-1', 'attention'],
    ],
  );
});

/**
 * Regression — found on the dogfood feed 2026-08-01 as a React duplicate-key
 * error (`task:REPAIR:3`).
 *
 * `aggregateMyDayFeed` derives `doNext` and `assigned` from ONE set:
 * `topWorkOrderForStaff` ranks the staffer's actionable rows and returns the
 * first, and `assigned` is that same predicate unfiltered. So the top row is
 * always in both, and a naive concat rendered it twice, with lane and
 * due-horizon counts inflated to match. Every fixture feed gave `doNext` a
 * unique id, which is exactly why no test caught it.
 */
test('a doNext row that is ALSO in assigned appears once, in the do_next lane', () => {
  const shared = workOrder({ id: 'REPAIR:3', title: 'Repair the deck' });
  const feed: MyDayFeed = {
    doNext: shared,
    assigned: [shared, workOrder({ id: 'wo-other', title: 'Other' })],
    interrupts: [],
    queueCards: [],
    counts: { assigned: 2, interrupts: 0, unassigned: 0 },
  };

  const tasks = myDayTasksFromFeed(feed);
  assert.deepEqual(tasks.map((t) => [t.id, t.lane]), [
    ['REPAIR:3', 'do_next'],
    ['wo-other', 'assigned'],
  ]);
  // The row ids the grid keys on must be unique, or React drops/duplicates rows.
  assert.equal(new Set(tasks.map((t) => t.id)).size, tasks.length);
});

test('lane and due-horizon counts do not double-count the shared doNext row', () => {
  const due = '2026-08-01T18:00:00.000Z';
  const shared = workOrder({ id: 'REPAIR:3', deadlineAt: due });
  const tasks = myDayTasksFromFeed({
    doNext: shared,
    assigned: [shared],
    interrupts: [],
    queueCards: [],
    counts: { assigned: 1, interrupts: 0, unassigned: 0 },
  });

  assert.equal(tasks.length, 1);
  assert.equal(myDayDueHorizonCounts(tasks, '2026-08-01').due_today, 1);
});
