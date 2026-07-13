/**
 * Operations TV-board aggregation — PURE, DB-free (HOME-OPS Phase C).
 *
 * The wall board answers one question: "what must be done on time, and what's
 * slipping?" It reduces the org's open plan tasks + active plans into four
 * lanes — Due today, Overdue, By station, Plan progress — for a large-type
 * Monitor read at 3–5m (plan §7.2).
 *
 * Kept pure so the route stays a thin fetch→aggregate→respond shell and the
 * math is unit-testable with zero DB (mirrors inbox.ts / progress.ts). All
 * "now" comes in as injected instants (civil-day bounds computed by the caller
 * via `warehouseDayUtcBounds` — never `Date.now()` in here) so tests are
 * deterministic under any TZ.
 *
 * `blocked` (the plan's third lane) has no first-class column yet — task status
 * is only open|in_progress|done|canceled. Until collab lands a real block row
 * (Phase D), **Overdue is the honest "stuck" proxy** and is what this surfaces.
 */

import type { PlanRow, TaskRow } from './types';
import { OPS_PLAN_STATIONS, type OpsPlanStation } from './constants';
import { MASTER_PLAN_OPS_TITLE, CONNECTIONS_ADOPTION_OPS_TITLE } from '@/lib/master-plan/ops-plans-bridge-constants';

/** Max rows rendered per task lane (Due today / Overdue) — the rest roll into counts. */
export const TV_BOARD_LANE_LIMIT = 12;

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_TASK_STATUSES = new Set(['open', 'in_progress']);

/** Where a plan (and thus its tasks) comes from — labels the ADMIN column (§27). */
export type TvPlanSource = 'agentic' | 'adoption' | 'authored';

export interface TvBoardTask {
  id: string;
  title: string;
  planId: string;
  planTitle: string;
  planSource: TvPlanSource;
  station: string;
  assigneeName: string | null;
  dueAt: string | null;
  /** Whole warehouse-days overdue (≥1 in the Overdue lane; 0 for Due today). */
  daysLate: number;
}

export interface TvBoardStation {
  station: OpsPlanStation;
  open: number;
  inProgress: number;
  overdue: number;
  /** Of `open`, how many are bridged product/eng tickets (agentic plan) — ADMIN only, in practice. */
  agentic: number;
}

export interface TvBoardPlan {
  planId: string;
  title: string;
  source: TvPlanSource;
  percentComplete: number;
  done: number;
  total: number;
}

export interface TvBoard {
  dateKey: string;
  generatedAt: string;
  counts: { open: number; dueToday: number; overdue: number; inProgress: number; unscheduled: number };
  dueToday: TvBoardTask[];
  overdue: TvBoardTask[];
  byStation: TvBoardStation[];
  plans: TvBoardPlan[];
}

export interface BuildTvBoardInput {
  /** Open + in_progress tasks (listTasksForInbox default filter). */
  tasks: TaskRow[];
  /** Active plans for the progress lane (listPlans({ status: 'active' })). */
  plans: PlanRow[];
  /** Warehouse civil-day start / end as UTC epoch ms (from warehouseDayUtcBounds). */
  dayStartMs: number;
  dayEndMs: number;
  /** Warehouse civil-day key (getCurrentPSTDateKey) + response stamp — injected for determinism. */
  dateKey: string;
  generatedAt: string;
  laneLimit?: number;
}

function planSourceOf(title: string): TvPlanSource {
  if (title === MASTER_PLAN_OPS_TITLE) return 'agentic';
  if (title === CONNECTIONS_ADOPTION_OPS_TITLE) return 'adoption';
  return 'authored';
}

function parseMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Whole civil-days a due instant sits before today's civil-day start (≥1). */
function daysLateFor(dueMs: number, dayStartMs: number): number {
  return Math.max(1, Math.ceil((dayStartMs - dueMs) / DAY_MS));
}

/**
 * Reduce open tasks + active plans into the wall-board shape. Deterministic:
 * every "now" is injected. Tasks are assumed pre-sorted by `due_at ASC NULLS
 * LAST` (listTasksForInbox's order), so lane slices are already due-first.
 */
export function buildTvBoard(input: BuildTvBoardInput): TvBoard {
  const laneLimit = input.laneLimit ?? TV_BOARD_LANE_LIMIT;
  const active = input.tasks.filter((t) => ACTIVE_TASK_STATUSES.has(t.status));

  const dueToday: TvBoardTask[] = [];
  const overdue: TvBoardTask[] = [];
  let inProgress = 0;
  let unscheduled = 0;

  // Per-station tallies, seeded so every canonical station renders even at zero.
  const stationMap = new Map<string, TvBoardStation>(
    OPS_PLAN_STATIONS.map((s) => [s, { station: s, open: 0, inProgress: 0, overdue: 0, agentic: 0 }]),
  );

  for (const t of active) {
    const source = planSourceOf(t.planTitle);
    if (t.status === 'in_progress') inProgress += 1;

    const bucket = stationMap.get(t.station);
    if (bucket) {
      bucket.open += 1;
      if (t.status === 'in_progress') bucket.inProgress += 1;
      if (source === 'agentic') bucket.agentic += 1;
    }

    const dueMs = parseMs(t.dueAt);
    const row = (daysLate: number): TvBoardTask => ({
      id: t.id,
      title: t.title,
      planId: t.planId,
      planTitle: t.planTitle,
      planSource: source,
      station: t.station,
      assigneeName: t.assigneeName,
      dueAt: t.dueAt,
      daysLate,
    });

    if (dueMs == null) {
      unscheduled += 1;
      continue;
    }
    if (dueMs < input.dayStartMs) {
      overdue.push(row(daysLateFor(dueMs, input.dayStartMs)));
      if (bucket) bucket.overdue += 1;
    } else if (dueMs <= input.dayEndMs) {
      dueToday.push(row(0));
    }
    // Future-dated (> today) tasks are intentionally omitted from both lanes.
  }

  const plans: TvBoardPlan[] = input.plans.map((p) => ({
    planId: p.id,
    title: p.title,
    source: planSourceOf(p.title),
    percentComplete: p.progress.percentComplete,
    done: p.progress.doneTasks,
    total: p.progress.totalTasks,
  }));

  return {
    dateKey: input.dateKey,
    generatedAt: input.generatedAt,
    counts: {
      open: active.length,
      dueToday: dueToday.length,
      overdue: overdue.length,
      inProgress,
      unscheduled,
    },
    dueToday: dueToday.slice(0, laneLimit),
    overdue: overdue.slice(0, laneLimit),
    byStation: OPS_PLAN_STATIONS.map((s) => stationMap.get(s)!),
    plans,
  };
}
