/**
 * Home read-tools — the three surfaces the app home page used to render as
 * modes (`daily` = the daily checklist, `today` = My Day, `tasks` = the ops
 * plan task inbox), demoted to assistant reads.
 *
 * The home page is now the assistant. "Did the team run their checks", "what's
 * on today", "what are my project tasks" are QUESTIONS the model answers by
 * calling one of these and then showing the rows with `render_artifact`
 * (kind `table`) in the artifact panel — the same rows the old modes drew, now
 * addressable in one sentence.
 *
 * No new SQL: each tool wraps the exact helper the corresponding route used
 * (`loadDailyCheckReport`, `aggregateMyDayFeed`, `listTasksForInbox`) and the
 * existing pure flattener (`myDayTasksFromFeed`). Server-only defaults load
 * LAZILY through injectable Deps so the tool registry stays importable from
 * node:test (same pattern as `get_operations_journey`).
 *
 * Every returned cell is coerced to `string | number | boolean | null`, because
 * an artifact table row is exactly that — no nested source objects, no Dates.
 */

import { z } from 'zod';
import type { DailyCheckReport } from '@/lib/daily-checks/types';
import { myDayTasksFromFeed } from '@/lib/my-day/my-day-tasks';
import type { MyDayFeed } from '@/lib/my-day/my-day-types';
import type { TaskRow } from '@/lib/ops-plans/types';
import type { AssistantToolDef, AssistantToolDeps } from './types';

/** Row cells are scalars — a table artifact has no place to put an object. */
const str = (v: unknown): string => (v == null ? '' : String(v));
const nullableStr = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

// ─── get_daily_checks ────────────────────────────────────────────────────────

export interface DailyChecksToolDeps {
  loadReport: (args: {
    orgId: string;
    dateKey: string;
    viewerStaffId: number | null;
  }) => Promise<DailyCheckReport>;
  /** The warehouse civil day, injectable so "today" is testable. */
  todayKey: () => string;
}

async function loadDefaultDailyChecksDeps(): Promise<DailyChecksToolDeps> {
  // Dynamic on purpose: `daily-checks/queries` pulls the pg tenancy pool in, and
  // the registry must stay importable from node:test (read-tools.test.ts).
  const [{ loadDailyCheckReport }, { getCurrentPSTDateKey }] = await Promise.all([
    import('@/lib/daily-checks/queries'),
    import('@/utils/date'),
  ]);
  return { loadReport: loadDailyCheckReport, todayKey: getCurrentPSTDateKey };
}

const dailyChecksInput = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const getDailyChecksTool: AssistantToolDef<typeof dailyChecksInput> = {
  name: 'get_daily_checks',
  description:
    'The warehouse daily checklist for one civil day (PST): which fixed items were in effect, how many ticks landed out of how many were possible, the viewer\'s own row, and every rostered staffer\'s doneCount / total / lastMarkedAt — including people who checked nothing, which is exactly who the report is read to find. Use for "did the team run their daily checks", "who has not checked in today", "checks for 2026-09-01". Omit `date` for today. Returns { dateKey, totalDone, totalPossible, items[], mine, staff[] }; SHOW the staff rows to the user with render_artifact as a table (columns: name, doneCount, total, lastMarkedAt) rather than listing them in prose.',
  permission: 'dashboard.view',
  inputSchema: dailyChecksInput,
  run: async (input, ctx, deps) => {
    const d =
      (deps as AssistantToolDeps & { dailyChecks?: DailyChecksToolDeps }).dailyChecks ??
      (await loadDefaultDailyChecksDeps());
    const dateKey = input.date ?? d.todayKey();
    const report = await d.loadReport({
      orgId: ctx.organizationId,
      dateKey,
      viewerStaffId: ctx.staffId,
    });
    return {
      dateKey: str(report.dateKey),
      totalDone: num(report.totalDone),
      totalPossible: num(report.totalPossible),
      items: report.items.map((it) => ({ id: num(it.id), title: str(it.title) })),
      mine: {
        doneCount: num(report.mine.doneCount),
        total: num(report.mine.total),
        lastMarkedAt: nullableStr(report.mine.lastMarkedAt),
      },
      staff: report.staff.map((row) => ({
        name: str(row.name),
        doneCount: num(row.doneCount),
        total: num(row.total),
        lastMarkedAt: nullableStr(row.lastMarkedAt),
      })),
    };
  },
};

// ─── get_my_day ──────────────────────────────────────────────────────────────

export interface MyDayToolDeps {
  aggregate: (args: {
    organizationId: string;
    staffId: number;
    permissions: Set<string>;
  }) => Promise<MyDayFeed>;
}

async function loadDefaultMyDayDeps(): Promise<MyDayToolDeps> {
  // Dynamic on purpose: the aggregator fans out to work-order/tech-queue DB
  // reads; keeping it off the registry's import graph keeps node:test DB-free.
  const { aggregateMyDayFeed } = await import('@/lib/my-day/aggregate-my-day');
  return { aggregate: aggregateMyDayFeed };
}

const myDayInput = z.object({});

export const getMyDayTool: AssistantToolDef<typeof myDayInput> = {
  name: 'get_my_day',
  description:
    'The signed-in operator\'s own day, flattened to one row type: the single row to do next (lane `do_next`), everything assigned to them (lane `assigned`), and the interrupts waiting on them — unboxed returns needing a test and support follow-ups (lane `attention`) — plus the queue counts that link elsewhere. Use for "what is on my day", "what should I work on next", "anything waiting on me". Takes no arguments: the staff identity comes from the session, never from you. Returns { counts, tasks[], queueCards[] }; SHOW tasks with render_artifact as a table (columns: lane, title, queueLabel, recordLabel, status, deadlineAt) and keep prose to the one-line recommendation.',
  permission: 'dashboard.view',
  inputSchema: myDayInput,
  run: async (_input, ctx, deps) => {
    if (ctx.staffId == null) {
      return {
        error: 'no staff identity on this session',
        counts: { assigned: 0, interrupts: 0, unassigned: 0 },
        tasks: [] as Array<Record<string, string | number | boolean | null>>,
        queueCards: [] as Array<{ label: string; count: number }>,
      };
    }
    const d =
      (deps as AssistantToolDeps & { myDay?: MyDayToolDeps }).myDay ??
      (await loadDefaultMyDayDeps());
    const feed = await d.aggregate({
      organizationId: ctx.organizationId,
      staffId: ctx.staffId,
      // ctx.permissions is a ReadonlySet; the aggregator wants a Set.
      permissions: new Set(ctx.permissions),
    });
    return {
      counts: {
        assigned: num(feed.counts.assigned),
        interrupts: num(feed.counts.interrupts),
        unassigned: num(feed.counts.unassigned),
      },
      // The pure flattener the Today grid uses — same rows, same dedupe of the
      // doNext pointer that also lives in `assigned`.
      tasks: myDayTasksFromFeed(feed).map((t) => ({
        id: str(t.id),
        lane: str(t.lane),
        title: str(t.title),
        subtitle: str(t.subtitle),
        queueLabel: str(t.queueLabel),
        recordLabel: nullableStr(t.recordLabel),
        status: nullableStr(t.status),
        deadlineAt: nullableStr(t.deadlineAt),
      })),
      queueCards: feed.queueCards.map((c) => ({ label: str(c.label), count: num(c.count) })),
    };
  },
};

// ─── get_project_tasks ───────────────────────────────────────────────────────

/** The artifact panel is a reading surface, not a paginator. */
const PROJECT_TASK_LIMIT = 200;

export interface ProjectTasksToolDeps {
  listTasks: (
    orgId: string,
    filters: {
      planId?: string | null;
      staffId?: number | null;
      status?: 'open' | 'all' | 'done' | 'canceled';
    },
  ) => Promise<ReadonlyArray<TaskRow>>;
}

async function loadDefaultProjectTasksDeps(): Promise<ProjectTasksToolDeps> {
  // Dynamic on purpose: `ops-plans/queries` opens the tenancy pool at import.
  const { listTasksForInbox } = await import('@/lib/ops-plans/queries');
  return { listTasks: listTasksForInbox };
}

const projectTasksInput = z.object({
  scope: z.enum(['mine', 'all']).optional(),
  status: z.enum(['open', 'done', 'canceled', 'all']).optional(),
  planId: z.string().optional(),
});

export const getProjectTasksTool: AssistantToolDef<typeof projectTasksInput> = {
  name: 'get_project_tasks',
  description:
    'Strategic ops-plan tasks (the project inbox): title, lifecycle status, the station and plan they belong to, who they are assigned to, and when they are due — ordered due-first. `scope` defaults to `mine` (the signed-in staffer, resolved from the session), pass `all` for the whole org; `status` defaults to `open` (open + in_progress), and `planId` narrows to one plan. Use for "what are my project tasks", "what is still open on the receiving plan", "what did we finish". Returns { tasks[] } capped at 200 rows; SHOW them with render_artifact as a table (columns: title, status, station, planTitle, assigneeName, dueAt) instead of retyping the list.',
  permission: 'operations.plans.view',
  inputSchema: projectTasksInput,
  run: async (input, ctx, deps) => {
    const d =
      (deps as AssistantToolDeps & { projectTasks?: ProjectTasksToolDeps }).projectTasks ??
      (await loadDefaultProjectTasksDeps());
    // `mine` is the default, matching /api/ops-plans/tasks — the staff id comes
    // from the session, so the model can never widen the scope by naming one.
    const scope = input.scope ?? 'mine';
    const rows = await d.listTasks(ctx.organizationId, {
      planId: input.planId ?? null,
      staffId: scope === 'mine' ? ctx.staffId : null,
      status: input.status ?? 'open',
    });
    return {
      tasks: rows.slice(0, PROJECT_TASK_LIMIT).map((t) => ({
        id: str(t.id),
        title: str(t.title),
        status: str(t.status),
        station: str(t.station),
        planTitle: str(t.planTitle),
        assigneeName: nullableStr(t.assigneeName),
        dueAt: nullableStr(t.dueAt),
      })),
    };
  },
};
