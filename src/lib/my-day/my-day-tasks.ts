/** My Day feed → triage TASK rows — the read model behind the Today spreadsheet. */

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

/** `assigned` is deliberately **not** "Assigned to me" — the surface is My Day, so every row on it is already this operator's. */
const LANE_LABEL: Record<MyDayLaneFilter, string> = {
  all: 'All',
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

/** The lane as a CHIP label. */
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

/** Flatten the feed into the table's rows, in the order the operator should work them: */
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

/** The chrome search's predicate — a REFINEMENT of the rows already on screen, not a retrieval. */
export function searchMyDayTasks(tasks: readonly MyDayTask[], query: string): MyDayTask[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...tasks];
  return tasks.filter((t) =>
    [t.title, t.subtitle, t.queueLabel, t.recordLabel]
      .some((field) => field?.toLowerCase().includes(needle)),
  );
}

/** Which side of today a task's deadline falls on — the ONE axis Today's KPI band measures. */
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

/** The horizon a task sits in, or `null` when it has no deadline at all. */
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
