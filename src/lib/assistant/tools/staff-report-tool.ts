/**
 * get_staff_report — per staff, per day: packing pace, task time, goals
 * (chat-roi row 11). GREEN, read-only.
 *
 * Three existing reads, joined on staff id and day, never re-derived:
 *  - packing: `getPackingKpisForDay` (boxes by size, weighted minutes, the
 *    org's capacity standard) — one call per day in the window;
 *  - task time: `loadPomodoroReport` (measured focus seconds per task /
 *    checklist item, completions) — the manager drilldown's own read;
 *  - goals: `getAllStaffGoalsWithStats` (daily goal, today / 7-day counts).
 *
 * The report artifact carries every number; the model reads a summary.
 */

import { z } from 'zod';
import { brandReportEnvelope, type ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactReport, ArtifactReportKpi } from '@/lib/assistant/ui-artifacts';
import { getAllStaffGoalsWithStats } from '@/lib/neon/staff-goals-queries';
import { getPackingKpisForDay, type PackingKpiSummary } from '@/lib/packing/packer-kpi-queries';
import type { PomodoroReport } from '@/lib/pomodoro/contract';
import { loadPomodoroReport } from '@/lib/pomodoro/report';
import { pomodoroReportDbDeps } from '@/lib/pomodoro/report-db';
import type { OrgId } from '@/lib/tenancy/constants';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import type { AssistantToolDef, AssistantToolDeps } from './types';
import { warehouseToday } from './worklist-tool';

/** Widest window one chat report reads (one packing read per day). */
export const STAFF_REPORT_MAX_DAYS = 14;

export interface StaffGoal {
  staff_id: number;
  staff_name: string;
  station: string;
  daily_goal: number;
  today_count: number;
  week_count: number;
}

export interface StaffReportInput {
  from: string;
  to: string;
  today: string;
  asOf: string;
  question: string;
  /** The one staff member asked about; null = everyone. */
  staff: { id: number; name: string } | null;
  packing: readonly PackingKpiSummary[];
  pomodoro: PomodoroReport;
  goals: readonly StaffGoal[];
}

interface StaffDay {
  staffId: number;
  name: string;
  date: string;
  boxes: number;
  weightedMin: number;
  focusSec: number;
  done: number;
}

/** Inclusive YYYY-MM-DD days from `from` to `to`. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const minutes = (sec: number) => Math.round(sec / 60);

/** Fold packing and task time into one row per staff per day. */
export function foldStaffDays(packing: readonly PackingKpiSummary[], pomodoro: PomodoroReport, staffId: number | null): StaffDay[] {
  const rows = new Map<string, StaffDay>();
  const row = (id: number, name: string | null, date: string) => {
    const key = `${id}:${date}`;
    let r = rows.get(key);
    if (!r) {
      r = { staffId: id, name: name?.trim() || `Staff ${id}`, date, boxes: 0, weightedMin: 0, focusSec: 0, done: 0 };
      rows.set(key, r);
    }
    return r;
  };
  for (const day of packing) {
    for (const p of day.by_packer) {
      if (staffId !== null && p.staff_id !== staffId) continue;
      const r = row(p.staff_id, p.staff_name, day.day);
      r.boxes += p.small_count + p.medium_count + p.large_count;
      r.weightedMin += p.weighted_minutes;
    }
  }
  for (const t of pomodoro.rows) {
    if (staffId !== null && t.staffId !== staffId) continue;
    const r = row(t.staffId, t.staffName, t.date);
    r.focusSec += t.measuredFocusSeconds;
    r.done += t.completedAt.length;
  }
  return [...rows.values()].sort((a, b) => b.date.localeCompare(a.date) || b.boxes - a.boxes || a.name.localeCompare(b.name));
}

function goalStatus(today: number, goal: number): ArtifactReportKpi['status'] {
  if (goal <= 0) return 'neutral';
  return today >= goal ? 'good' : today >= goal / 2 ? 'watch' : 'bad';
}

export function buildStaffReport(input: StaffReportInput): ToolArtifactEnvelope {
  const { from, to, staff } = input;
  const days = foldStaffDays(input.packing, input.pomodoro, staff?.id ?? null);
  const byStaff = new Map<number, StaffDay>();
  for (const d of days) {
    const s = byStaff.get(d.staffId) ?? { ...d, date: '', boxes: 0, weightedMin: 0, focusSec: 0, done: 0 };
    s.boxes += d.boxes;
    s.weightedMin += d.weightedMin;
    s.focusSec += d.focusSec;
    s.done += d.done;
    byStaff.set(d.staffId, s);
  }
  const goals = new Map(input.goals.map((g) => [g.staff_id, g]));
  const boxes = days.reduce((n, d) => n + d.boxes, 0);
  const weighted = days.reduce((n, d) => n + d.weightedMin, 0);
  const focus = days.reduce((n, d) => n + d.focusSec, 0);
  const done = days.reduce((n, d) => n + d.done, 0);
  const window = from === to ? from : `${from} to ${to}`;
  const who = staff?.name ?? 'All staff';
  const goal = staff ? goals.get(staff.id) : undefined;
  const includesToday = from <= input.today && input.today <= to;
  const capacity = input.packing[0]?.capacity;

  const kpis: ArtifactReportKpi[] = [
    { id: 'boxes', label: 'Boxes packed', value: String(boxes), unit: 'boxes', status: 'neutral', definition: 'Packing station boxes (small + medium + large) in the window, Pacific days.' },
    { id: 'weighted', label: 'Weighted pack minutes', value: String(Math.round(weighted)), unit: 'min', status: 'neutral', definition: 'Boxes × the org\'s per-size pack minutes (the packing capacity standard).' },
    { id: 'focus', label: 'Measured task time', value: String(minutes(focus)), unit: 'min', status: 'neutral', definition: 'Focus-timer seconds recorded against tasks and checklist items (not wall clock).' },
    { id: 'done', label: 'Tasks completed', value: String(done), unit: null, status: 'neutral', definition: 'Task and checklist completions recorded in the window.' },
    ...(goal && includesToday
      ? [{
          id: 'goal',
          label: `Today vs goal (${goal.station})`,
          value: `${goal.today_count} / ${goal.daily_goal}`,
          unit: null,
          target: String(goal.daily_goal),
          status: goalStatus(goal.today_count, goal.daily_goal),
          definition: 'Station scans today against the staff member\'s daily goal (staff goals).',
        } satisfies ArtifactReportKpi]
      : []),
  ];

  const staffRows = [...byStaff.values()]
    .sort((a, b) => b.boxes - a.boxes || b.focusSec - a.focusSec || a.name.localeCompare(b.name))
    .map((s) => {
      const g = goals.get(s.staffId);
      return {
        staff: s.name,
        boxes: s.boxes,
        weighted: Math.round(s.weightedMin),
        focus: minutes(s.focusSec),
        done: s.done,
        goal: g ? g.daily_goal : null,
        today: g ? g.today_count : null,
        week: g ? g.week_count : null,
      };
    });

  const tasks = input.pomodoro.rows
    .filter((t) => (staff ? t.staffId === staff.id : true) && (t.measuredFocusSeconds > 0 || t.completedAt.length > 0))
    .sort((a, b) => b.measuredFocusSeconds - a.measuredFocusSeconds)
    .slice(0, 50)
    .map((t) => ({
      date: t.date,
      staff: t.staffName ?? `Staff ${t.staffId}`,
      task: t.title.slice(0, 300),
      focus: minutes(t.measuredFocusSeconds),
      done: t.completedAt.length > 0 ? 'Yes' : 'No',
    }));

  const report: ArtifactReport = {
    kind: 'report',
    title: `${who} · ${window}`.slice(0, 120),
    question: (input.question || `Staff report for ${who}, ${window}`).slice(0, 300),
    asOf: input.asOf,
    scope: `${who} · ${window} (Pacific days)`.slice(0, 200),
    headline: { value: String(boxes), unit: 'boxes', label: `Boxes packed${staff ? ` by ${staff.name}` : ''}`.slice(0, 120), hint: `${minutes(focus)} min measured task time · ${done} completed`.slice(0, 200) },
    kpis,
    sections: [
      {
        title: 'By staff',
        columns: [
          { key: 'staff', label: 'Staff' },
          { key: 'boxes', label: 'Boxes', align: 'right' },
          { key: 'weighted', label: 'Weighted min', align: 'right', unit: 'min' },
          { key: 'focus', label: 'Task time', align: 'right', unit: 'min' },
          { key: 'done', label: 'Done', align: 'right' },
          { key: 'today', label: 'Today', align: 'right' },
          { key: 'goal', label: 'Daily goal', align: 'right' },
          { key: 'week', label: '7 days', align: 'right' },
        ],
        rows: staffRows,
      },
      {
        title: 'By day',
        columns: [
          { key: 'date', label: 'Day' },
          { key: 'staff', label: 'Staff' },
          { key: 'boxes', label: 'Boxes', align: 'right' },
          { key: 'weighted', label: 'Weighted min', align: 'right', unit: 'min' },
          { key: 'focus', label: 'Task time', align: 'right', unit: 'min' },
          { key: 'done', label: 'Done', align: 'right' },
        ],
        rows: days.slice(0, 300).map((d) => ({ date: d.date, staff: d.name, boxes: d.boxes, weighted: Math.round(d.weightedMin), focus: minutes(d.focusSec), done: d.done })),
      },
      ...(tasks.length
        ? [{
            title: 'Task time',
            note: 'Measured focus per task or checklist item, longest first.',
            columns: [
              { key: 'date', label: 'Day' },
              { key: 'staff', label: 'Staff' },
              { key: 'task', label: 'Task' },
              { key: 'focus', label: 'Focus', align: 'right' as const, unit: 'min' },
              { key: 'done', label: 'Completed' },
            ],
            rows: tasks,
          }]
        : []),
    ],
    standards: capacity
      ? [
          { label: 'Packing capacity', value: String(capacity.daily_capacity_minutes), unit: 'min / day', note: `${capacity.packer_headcount} packers × ${capacity.workday_minutes} min workday` },
        ]
      : [],
    notes: [
      'Task time is focus-timer time the staff member recorded, not the wall-clock time a task was open.',
      'Goals compare station scans today and over the last 7 days with each staff member\'s daily goal.',
    ],
    followUps: [
      ...(staff ? [{ label: 'Whole team', question: `Staff report for everyone, ${window}` }] : []),
      { label: 'Last 7 days', question: `Staff report for ${who === 'All staff' ? 'everyone' : who}, last 7 days` },
    ],
  };

  const top = staffRows.slice(0, 5).map((s) => `${s.staff} ${s.boxes} boxes, ${s.focus} min task time`).join('; ');
  const goalLine = goal && includesToday ? ` Today ${goal.today_count} of a ${goal.daily_goal} ${goal.station.toLowerCase()} goal.` : '';
  const answer = staffRows.length
    ? `${who}, ${window}: ${boxes} boxes packed (${Math.round(weighted)} weighted min), ${minutes(focus)} min measured task time, ${done} completed.${goalLine}`
    : `${who}, ${window}: no packing or task time recorded.${goalLine}`;
  return brandReportEnvelope(
    { artifact: report, summary: `${answer}${top && !staff ? ` By staff: ${top}.` : ''} The report is already on screen — say the headline and one next step.`, answer },
    'get_staff_report',
  );
}

// ─── The tool ────────────────────────────────────────────────────────────────

const STAFF_SQL = `SELECT id, name FROM staff
 WHERE organization_id = $1 AND active = true
   AND (lower(name) = lower($2) OR name ILIKE $3)
 ORDER BY (lower(name) = lower($2)) DESC, name
 LIMIT 6`;

export interface StaffReportSources {
  packing: (orgId: OrgId, day: string) => Promise<PackingKpiSummary>;
  pomodoro: (orgId: OrgId, from: string, to: string, staffId?: number) => Promise<PomodoroReport>;
  goals: (orgId: OrgId) => Promise<StaffGoal[]>;
}

const realSources: StaffReportSources = {
  packing: getPackingKpisForDay,
  pomodoro: (orgId, from, to, staffId) => loadPomodoroReport({ orgId, from, to, ...(staffId ? { staffId } : {}) }, pomodoroReportDbDeps),
  goals: async (orgId) => (await getAllStaffGoalsWithStats(orgId)) as StaffGoal[],
};

let sources: StaffReportSources = realSources;

/** Test seam — swap the reads; returns a restore function. */
export function setStaffReportSourcesForTest(next: StaffReportSources): () => void {
  sources = next;
  return () => {
    sources = realSources;
  };
}

async function resolveStaff(orgId: OrgId, name: string, deps: AssistantToolDeps) {
  const { rows } = await deps.query(orgId, STAFF_SQL, [orgId, name, `${name.replace(/[%_\\]/g, '\\$&')}%`]);
  const exact = rows.filter((r) => String(r.name).toLowerCase() === name.toLowerCase());
  const hits = exact.length ? exact : rows;
  return hits.map((r) => ({ id: Number(r.id), name: String(r.name) }));
}

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const staffReportInput = z.object({
  staff: z.string().trim().min(1).max(80).optional().describe('Staff name as the operator said it; omit for everyone.'),
  from: dateKey.optional().describe('First day, YYYY-MM-DD (Pacific). Defaults to today.'),
  to: dateKey.optional().describe('Last day, YYYY-MM-DD (Pacific). Defaults to `from`.'),
});

export const getStaffReport: AssistantToolDef<typeof staffReportInput> = {
  name: 'get_staff_report',
  description:
    'Staff performance and time report, per staff and per day: boxes packed (packing pace), measured task time per task, tasks completed, and daily goal progress. Use for "<name>\'s performance", "how much time did <name> spend on tasks", "staff report this week". Shows the report itself.',
  permission: 'operations.view',
  inputSchema: staffReportInput,
  run: async (input, ctx, deps) => {
    const org = ctx.organizationId;
    const today = warehouseToday();
    const from = input.from ?? input.to ?? today;
    const to = input.to && input.to >= from ? input.to : from;
    const window = daysBetween(from, to);
    if (window.length > STAFF_REPORT_MAX_DAYS) {
      return { found: false, message: `That window is ${window.length} days; a staff report covers at most ${STAFF_REPORT_MAX_DAYS} days. Ask for a shorter range.` };
    }
    let staff: { id: number; name: string } | null = null;
    if (input.staff) {
      const hits = await resolveStaff(org, input.staff, deps);
      if (hits.length === 0) return { found: false, message: `No active staff member is named "${input.staff}".` };
      if (hits.length > 1) {
        return { found: false, candidates: hits.map((h) => h.name), message: `Several staff match "${input.staff}": ${hits.map((h) => h.name).join(', ')}. Ask which one.` };
      }
      staff = hits[0];
    }
    const [packing, pomodoro, goals] = await Promise.all([
      Promise.all(window.map((d) => sources.packing(org, d))),
      sources.pomodoro(org, from, to, staff?.id),
      sources.goals(org),
    ]);
    return buildStaffReport({
      from,
      to,
      today,
      asOf: new Intl.DateTimeFormat('en-US', { timeZone: WAREHOUSE_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
      question: ctx.userMessage?.trim() ?? '',
      staff,
      packing,
      pomodoro,
      goals,
    });
  },
};
