/**
 * My Day feed → triage TASK rows — the read model behind the Today spreadsheet.
 *
 * `GET /api/my-day` answers in four heterogeneous shapes (`doNext` is a single
 * object, `assigned` and `interrupts` are arrays of two different types,
 * `queueCards` are counts+hrefs). A LedgerGrid needs ONE row type, so the
 * flattening lives here — pure, no React, no fetch — and the view stays dumb
 * (Kinetic Ledger law 4).
 *
 * This is deliberately NOT the backend `TriageTask` from the daily-triage plan's
 * B0–B3: that carries `category` / `open` / `done` and does not exist in this
 * repo yet. `MyDayTask` claims only what today's feed actually knows. When
 * `TriageTask` lands, this module is the one place that changes.
 *
 * `queueCards` are NOT tasks — they are counts that link to another page, so
 * they stay navigation (the sidebar), never rows in the task table.
 */

import type { WorkOrderRow } from '@/components/work-orders/types';
import { getCurrentPSTDateKey, toPSTDateKey } from '@/utils/date';
import type { MyDayFeed, MyDayInterrupt, MyDaySelectedItem } from './my-day-types';
import { workOrderHref } from './my-day-href';

/** Which band of the operator's day a task belongs to. */
export type MyDayLane = 'do_next' | 'assigned' | 'attention';

/** Sidebar scope — the lanes plus the unfiltered view. */
export type MyDayLaneFilter = MyDayLane | 'all';

export const MY_DAY_LANE_FILTERS: readonly MyDayLaneFilter[] = [
  'all',
  'do_next',
  'assigned',
  'attention',
] as const;

/**
 * `assigned` is deliberately **not** "Assigned to me" — the surface is My Day,
 * so every row on it is already this operator's. The qualifier was pure width
 * (2026-08-01 chrome pass): it was the longest label in the tab strip, and the
 * strip now has to seat the due-horizon chips the KPI band used to hold.
 */
const LANE_LABEL: Record<MyDayLaneFilter, string> = {
  all: 'Everything',
  do_next: 'Do next',
  assigned: 'Assigned',
  attention: 'Needs attention',
};

const LANE_CHIP: Record<MyDayLane, string> = {
  do_next: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  assigned: 'bg-blue-50 text-blue-700 ring-blue-200',
  attention: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const LANE_DOT: Record<MyDayLane, string> = {
  do_next: 'bg-emerald-500',
  assigned: 'bg-blue-500',
  attention: 'bg-amber-500',
};

/** Short chip labels for grid tracks — the full ones wrap a 6.5rem column. */
const LANE_SHORT_LABEL: Record<MyDayLane, string> = {
  do_next: 'Do next',
  assigned: 'Assigned',
  attention: 'Attention',
};

export function myDayLaneLabel(lane: MyDayLaneFilter): string {
  return LANE_LABEL[lane];
}

/**
 * The lane as a CHIP label. Deliberately shorter than {@link myDayLaneLabel}:
 * "Assigned to me" wraps to two lines inside the grid's lane track and pushes
 * the row off its density-owned height, which is the one thing a ledger row may
 * never do. The sidebar, which has the width, keeps the full phrasing.
 */
export function myDayLaneShortLabel(lane: MyDayLane): string {
  return LANE_SHORT_LABEL[lane];
}

/**
 * Tab tone for the chrome-band lane strip — same registry as the dot and the
 * chip, so a lane is one colour everywhere it appears. `all` is the neutral
 * scope, so it takes no lane hue.
 */
const LANE_TAB_COLOR: Record<MyDayLaneFilter, 'gray' | 'emerald' | 'blue' | 'orange'> = {
  all: 'gray',
  do_next: 'emerald',
  assigned: 'blue',
  attention: 'orange',
};

export function myDayLaneTabColor(lane: MyDayLaneFilter) {
  return LANE_TAB_COLOR[lane];
}

export function myDayLaneChipClass(lane: MyDayLane): string {
  return LANE_CHIP[lane];
}

export function myDayLaneDot(lane: MyDayLane): string {
  return LANE_DOT[lane];
}

/** `?scope=` → a lane, or `all` for anything this surface does not own. */
export function parseMyDayLane(raw: string | null | undefined): MyDayLaneFilter {
  const v = (raw || '').trim().toLowerCase();
  return (MY_DAY_LANE_FILTERS as readonly string[]).includes(v)
    ? (v as MyDayLaneFilter)
    : 'all';
}

/** One row of the Today spreadsheet. */
export interface MyDayTask {
  /** Stable row id — the work-order / interrupt id, and the `?task=` value. */
  id: string;
  lane: MyDayLane;
  title: string;
  subtitle: string;
  /** Which queue the work sits in ("Orders", "Testing", "Support"). */
  queueLabel: string;
  /** The record an operator would scan for — order id, ticket ref, PO. */
  recordLabel: string | null;
  /** Where the work actually happens. */
  href: string;
  /** Lifecycle state — work orders only; an interrupt has no status machine. */
  status: WorkOrderRow['status'] | null;
  deadlineAt: string | null;
  updatedAt: string | null;
  /**
   * The originating union, carried through for the inspector. Keeps the row flat
   * for the grid without the detail plane having to re-find the source record.
   */
  source: MyDaySelectedItem;
}

function fromWorkOrder(row: WorkOrderRow, lane: MyDayLane): MyDayTask {
  return {
    id: row.id,
    lane,
    title: row.title,
    subtitle: row.subtitle,
    queueLabel: row.queueLabel,
    recordLabel: row.orderId || row.recordLabel || null,
    href: workOrderHref(row),
    status: row.status,
    deadlineAt: row.deadlineAt,
    updatedAt: row.updatedAt ?? row.assignedAt ?? null,
    source: { kind: 'work_order', row },
  };
}

function fromInterrupt(item: MyDayInterrupt): MyDayTask {
  return {
    id: item.id,
    lane: 'attention',
    title: item.title,
    subtitle: item.subtitle,
    queueLabel: item.kind === 'support_followup' ? 'Support' : 'Tech',
    recordLabel: item.ticketId != null ? `#${item.ticketId}` : null,
    href: item.href,
    status: null,
    deadlineAt: null,
    updatedAt: new Date(item.createdAtMs).toISOString(),
    source: { kind: 'interrupt', item },
  };
}

/**
 * Flatten the feed into the table's rows, in the order the operator should work
 * them: what to do next, then their assigned queue, then the interrupts. Row
 * ORDER is the feed's ranking — a column sort replaces it, it does not fight it.
 *
 * **`doNext` is ALSO in `assigned`, always — so this must dedupe by id.**
 * `aggregateMyDayFeed` derives the two from one set: `topWorkOrderForStaff`
 * ranks the staffer's actionable rows and returns the first, while `assigned`
 * is that same predicate unfiltered. The feed is not wrong — `doNext` is a
 * POINTER into `assigned`, not a disjoint bucket — but a naive concat emits the
 * same work order twice, which on a real feed meant a duplicate React key
 * (`task:REPAIR:3`), the same task rendered twice in the table, and lane +
 * due-horizon counts inflated by one. It never showed in tests because fixture
 * feeds gave `doNext` an id no other row used.
 *
 * The `do_next` lane wins: it is the more specific answer to "what should I
 * touch first", and demoting it to `assigned` would empty the lane the surface
 * is built around.
 */
export function myDayTasksFromFeed(feed: MyDayFeed | undefined | null): MyDayTask[] {
  if (!feed) return [];
  const tasks: MyDayTask[] = [];
  const seen = new Set<string>();

  const push = (task: MyDayTask) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    tasks.push(task);
  };

  if (feed.doNext) push(fromWorkOrder(feed.doNext, 'do_next'));
  for (const row of feed.assigned) push(fromWorkOrder(row, 'assigned'));
  for (const item of feed.interrupts) push(fromInterrupt(item));
  return tasks;
}

export function filterMyDayTasks(tasks: readonly MyDayTask[], lane: MyDayLaneFilter): MyDayTask[] {
  return lane === 'all' ? [...tasks] : tasks.filter((t) => t.lane === lane);
}

/**
 * The chrome search's predicate — a REFINEMENT of the rows already on screen,
 * not a retrieval. It never leaves this array, which is why it is a substring
 * match here and not a `hybridSearch` call: the cross-entity engine is for
 * finding records the surface does not hold (`source-of-truth.md` → Cross-entity
 * search), and routing four in-memory rows through it would be a second search
 * waist for a filter.
 *
 * Matches what an operator would actually type at a task they can see: its
 * title, its one-line subtitle, the queue it sits in, and the record id they
 * would scan for. Lane and status are excluded — the lane is the tab strip and
 * status is a chip vocabulary, so typing "assigned" should not silently do the
 * tab's job with different results.
 */
export function searchMyDayTasks(tasks: readonly MyDayTask[], query: string): MyDayTask[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...tasks];
  return tasks.filter((t) =>
    [t.title, t.subtitle, t.queueLabel, t.recordLabel]
      .some((field) => field?.toLowerCase().includes(needle)),
  );
}

/**
 * Which side of today a task's deadline falls on — the ONE axis Today's KPI band
 * measures.
 *
 * This is the shape every personal work surface converges on (Zoho Projects' My
 * Work: Overdue · Today · Upcoming; Asana My Tasks: Due today · Upcoming ·
 * Later): a daily surface counts WHEN work is due, not business health. It is
 * deliberately not the lane counts — those are already the tab strip — and not
 * a completion metric, which no field in `MyDayFeed` can answer today.
 */
export type MyDayDueHorizon = 'overdue' | 'due_today' | 'upcoming';

export const MY_DAY_DUE_HORIZONS: readonly MyDayDueHorizon[] = [
  'overdue',
  'due_today',
  'upcoming',
] as const;

const DUE_HORIZON_LABEL: Record<MyDayDueHorizon, string> = {
  overdue: 'Overdue',
  due_today: 'Due today',
  upcoming: 'Upcoming',
};

/**
 * Chrome-band form. "Due today" → "Today": the three chips sit side by side, so
 * the word they share carries no information and only costs band width — the
 * same reason the grid's lane chips are shorter than the inspector's.
 */
const DUE_HORIZON_SHORT_LABEL: Record<MyDayDueHorizon, string> = {
  overdue: 'Overdue',
  due_today: 'Today',
  upcoming: 'Upcoming',
};

export function myDayDueHorizonLabel(horizon: MyDayDueHorizon): string {
  return DUE_HORIZON_LABEL[horizon];
}

export function myDayDueHorizonShortLabel(horizon: MyDayDueHorizon): string {
  return DUE_HORIZON_SHORT_LABEL[horizon];
}

/** `?filter=` → a horizon, or null for anything this surface does not own. */
export function parseMyDayDueHorizon(raw: string | null | undefined): MyDayDueHorizon | null {
  const v = (raw || '').trim().toLowerCase();
  return (MY_DAY_DUE_HORIZONS as readonly string[]).includes(v) ? (v as MyDayDueHorizon) : null;
}

/**
 * The horizon a task sits in, or `null` when it has no deadline at all.
 *
 * **Undated is a real answer, not a bucket.** Interrupts carry no `deadlineAt` —
 * only work orders have one — so folding them into `upcoming` would claim a due
 * date the record does not have. They stay legible through the Needs-attention
 * lane instead.
 *
 * Compared as CIVIL DAYS in the warehouse zone (`src/utils/date.ts`), never as
 * instants: "overdue" means the day has passed, not that a 5pm deadline is three
 * hours old, and a host-local `new Date()` comparison would put an operator in a
 * different timezone on a different day than the floor.
 */
export function myDayDueHorizon(
  task: MyDayTask,
  todayKey: string = getCurrentPSTDateKey(),
): MyDayDueHorizon | null {
  if (!task.deadlineAt) return null;
  const dueKey = toPSTDateKey(task.deadlineAt);
  if (!dueKey) return null;
  if (dueKey < todayKey) return 'overdue';
  if (dueKey === todayKey) return 'due_today';
  return 'upcoming';
}

export function filterMyDayTasksByHorizon(
  tasks: readonly MyDayTask[],
  horizon: MyDayDueHorizon | null,
  todayKey: string = getCurrentPSTDateKey(),
): MyDayTask[] {
  if (!horizon) return [...tasks];
  return tasks.filter((t) => myDayDueHorizon(t, todayKey) === horizon);
}

/** Due-horizon totals for the KPI band. Undated tasks count toward none. */
export function myDayDueHorizonCounts(
  tasks: readonly MyDayTask[],
  todayKey: string = getCurrentPSTDateKey(),
): Record<MyDayDueHorizon, number> {
  const out: Record<MyDayDueHorizon, number> = { overdue: 0, due_today: 0, upcoming: 0 };
  for (const task of tasks) {
    const horizon = myDayDueHorizon(task, todayKey);
    if (horizon) out[horizon] += 1;
  }
  return out;
}

/** Per-lane counts for the sidebar picker (`all` = the whole set). */
export function myDayLaneCounts(
  tasks: readonly MyDayTask[],
): Record<MyDayLaneFilter, number> {
  return {
    all: tasks.length,
    do_next: tasks.filter((t) => t.lane === 'do_next').length,
    assigned: tasks.filter((t) => t.lane === 'assigned').length,
    attention: tasks.filter((t) => t.lane === 'attention').length,
  };
}
