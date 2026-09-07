/**
 * get_delegation_plan — "Which staff can I delegate to attack the highest ROIs
 * in terms of pending tasks?"
 *
 * ## The shape of the answer
 *
 * The owner is not asking for a roster dump. They are asking, for the gaps that
 * are actually costing money right now, WHO has the room to take them. So the
 * report joins three things that live in three different places:
 *
 *   1. the ranked gaps — imported from `roi-rank.ts` via `rankGaps`, never
 *      re-derived here, so the two reports can never name a different top gap;
 *   2. station eligibility — `staff_stations`, with an `employee_id` prefix
 *      fallback for staffers nobody ever assigned a station to (and a note
 *      saying how many were derived that way, because a derived station is a
 *      weaker claim than an assigned one);
 *   3. current load — pending `work_assignments` (floor) plus pending
 *      `ops_plan_tasks` (desk), and today's scan throughput as evidence the
 *      person is actually on shift.
 *
 * ## Free capacity is an assumption, and says so
 *
 *     free_minutes = workday_minutes − (pending_tasks × ASSUMED_MINUTES_PER_TASK)
 *
 * There is no per-task duration in this schema, so 20 minutes is DECLARED. It is
 * printed in `standards[]` so the owner can argue with the 20 instead of
 * distrusting the ranking. Staff are listed ascending-loaded-first: the least
 * loaded eligible person is the first name.
 *
 * ## This report does not delegate
 *
 * It names WHO. Making the assignment is a human action through the existing
 * verb (`POST /api/tasks`, permission `work_orders.claim`); nothing here calls
 * it. Artifacts carry data, never behavior.
 *
 * ## Query budget
 *
 * Four statements, one per source, each leading with `organization_id = $1`:
 * roster+stations, pending floor work, pending desk tasks, today's scans. The
 * join is done in TypeScript — there is no pre-aggregated per-staff workload
 * rollup in this schema, and inventing a fifth round trip per staffer to fake
 * one would make an owner's question cost a hundred queries.
 */

import { z } from 'zod';
import type { AssistantToolCtx, AssistantToolDeps } from '@/lib/assistant/tools/types';
import type { ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type {
  ArtifactReport,
  ArtifactReportKpi,
  ArtifactReportSection,
  ArtifactReportStandard,
} from '@/lib/assistant/ui-artifacts';
import {
  count,
  emptyReport,
  minutes,
  operatorDay,
  operatorStamp,
  reportEnvelope,
  statusAbove,
  statusBelow,
} from './report-kit';
import {
  DEFAULT_WORKDAY_MINUTES,
  GAP_STATION,
  loadRoiGapRows,
  loadWorkdayMinutes,
  rankGaps,
  type RankedGap,
} from './roi-rank';

/**
 * Minutes of a staffer's day one pending task is assumed to consume.
 *
 * An ASSUMPTION, not a measurement: neither `work_assignments` nor
 * `ops_plan_tasks` records an expected duration, so free capacity has to lean on
 * a declared number. Printed on the report for exactly that reason.
 */
export const ASSUMED_MINUTES_PER_TASK = 20;

/** Station a staffer is put on when nobody ever wrote them a `staff_stations` row. */
export type StationName = 'TECH' | 'PACK' | 'UNBOX' | 'SALES' | 'FBA';

const STATION_PREFIXES: ReadonlyArray<[string, StationName]> = [
  ['PACK', 'PACK'],
  ['UNBOX', 'UNBOX'],
  ['SALES', 'SALES'],
  ['FBA', 'FBA'],
];

/**
 * Derive a station from `staff.employee_id` when `staff_stations` is silent.
 * `PACK-07` ⇒ PACK. Anything unrecognized falls to TECH, which is the floor's
 * catch-all bench. Callers must report that a station was derived, not assigned.
 */
export function stationFromEmployeeId(employeeId: string | null | undefined): StationName {
  const id = (employeeId ?? '').trim().toUpperCase();
  for (const [prefix, station] of STATION_PREFIXES) {
    if (id.startsWith(prefix)) return station;
  }
  return 'TECH';
}

/** Free minutes left in a staffer's day under the declared per-task assumption. */
export function freeMinutes(workdayMinutes: number, pendingTasks: number): number {
  return workdayMinutes - pendingTasks * ASSUMED_MINUTES_PER_TASK;
}

/** One staffer, after the four sources are joined. */
export interface RosterEntry {
  staffId: number;
  name: string;
  role: string;
  stations: StationName[];
  /** True when `stations` came from the employee_id prefix, not `staff_stations`. */
  stationsDerived: boolean;
  floorTasks: number;
  deskTasks: number;
  urgent: number;
  overdue: number;
  scansToday: number;
  pendingTasks: number;
  freeMinutes: number;
}

/** A pending item with nobody's name on it. */
export interface UnownedItem {
  source: 'Floor' | 'Desk';
  what: string;
  entity: string;
  priority: string;
  due: string;
  ageDays: number | null;
}

interface StaffRow {
  staff_id: number;
  name: string;
  role: string;
  employee_id: string | null;
  stations: string[] | null;
}

interface LoadRow {
  kind: 'agg' | 'row';
  assignee_staff_id: number | null;
  pending: number;
  urgent: number;
  overdue: number;
  what: string | null;
  entity: string | null;
  priority: string | null;
  due_at: string | null;
  age_days: number | null;
}

/**
 * Roster + station eligibility. `staff_stations` carries no `organization_id`
 * column of its own (see the migration) — tenancy comes from the `staff` row it
 * hangs off, which is why the org predicate leads on `s`.
 */
const STAFF_SQL = `
  SELECT s.id::int          AS staff_id,
         s.name             AS name,
         s.role             AS role,
         s.employee_id      AS employee_id,
         array_remove(array_agg(ss.station ORDER BY ss.is_primary DESC, ss.station), NULL) AS stations
    FROM staff s
    LEFT JOIN staff_stations ss ON ss.staff_id = s.id
   WHERE s.organization_id = $1
     AND coalesce(s.active, true) = true
     AND s.status = 'active'
   GROUP BY s.id, s.name, s.role, s.employee_id
   ORDER BY s.name`;

/**
 * Pending floor work: per-assignee totals PLUS the unowned rows themselves.
 * One statement, two shapes — the alternative is a second round trip that reads
 * the same predicate twice.
 *
 * `assignee_staff_id` is the canonical slot; the legacy tech/packer slots are
 * coalesced behind it because rows written before 2026-08-08b only filled those.
 */
const FLOOR_SQL = `
  WITH pending AS (
    SELECT coalesce(wa.assignee_staff_id, wa.assigned_tech_id, wa.assigned_packer_id) AS assignee_staff_id,
           wa.work_type::text     AS work_type,
           wa.entity_type::text   AS entity_type,
           wa.entity_id           AS entity_id,
           wa.priority            AS priority,
           wa.deadline_at         AS deadline_at,
           wa.created_at          AS created_at
      FROM work_assignments wa
     WHERE wa.organization_id = $1
       AND wa.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
  )
  SELECT 'agg'::text AS kind,
         assignee_staff_id,
         count(*)::int AS pending,
         count(*) FILTER (WHERE priority <= 10)::int AS urgent,
         count(*) FILTER (WHERE deadline_at IS NOT NULL AND deadline_at < now())::int AS overdue,
         NULL::text AS what,
         NULL::text AS entity,
         NULL::text AS priority,
         NULL::text AS due_at,
         NULL::int  AS age_days
    FROM pending
   GROUP BY assignee_staff_id
  UNION ALL
  SELECT * FROM (
    SELECT 'row'::text AS kind,
           NULL::int   AS assignee_staff_id,
           0::int      AS pending,
           0::int      AS urgent,
           0::int      AS overdue,
           work_type   AS what,
           entity_type || ' #' || entity_id::text AS entity,
           priority::text AS priority,
           to_char(deadline_at, 'YYYY-MM-DD') AS due_at,
           date_part('day', now() - created_at)::int AS age_days
      FROM pending
     WHERE assignee_staff_id IS NULL
     ORDER BY priority ASC, deadline_at ASC NULLS LAST, created_at ASC
     LIMIT 50
  ) unowned_floor`;

/**
 * Pending desk tasks, same two-shape statement.
 *
 * `ops_plan_tasks` has NO priority column, so urgency here can only come from
 * `due_at` — the `urgent` bucket is "due within a day or already past". It also
 * has no `station` of its own: the station lives on the parent
 * `ops_plan_phases` row, so the label for an unowned desk task is joined from
 * there rather than invented.
 */
const DESK_SQL = `
  WITH pending AS (
    SELECT t.assignee_staff_id AS assignee_staff_id,
           t.title             AS title,
           p.station           AS station,
           t.due_at            AS due_at,
           t.created_at        AS created_at
      FROM ops_plan_tasks t
      LEFT JOIN ops_plan_phases p
             ON p.id = t.phase_id
            AND p.organization_id = t.organization_id
     WHERE t.organization_id = $1
       AND t.status IN ('open', 'in_progress')
  )
  SELECT 'agg'::text AS kind,
         assignee_staff_id,
         count(*)::int AS pending,
         count(*) FILTER (WHERE due_at IS NOT NULL AND due_at < now() + interval '1 day')::int AS urgent,
         count(*) FILTER (WHERE due_at IS NOT NULL AND due_at < now())::int AS overdue,
         NULL::text AS what,
         NULL::text AS entity,
         NULL::text AS priority,
         NULL::text AS due_at,
         NULL::int  AS age_days
    FROM pending
   GROUP BY assignee_staff_id
  UNION ALL
  SELECT * FROM (
    SELECT 'row'::text AS kind,
           NULL::int   AS assignee_staff_id,
           0::int      AS pending,
           0::int      AS urgent,
           0::int      AS overdue,
           title       AS what,
           coalesce(station, 'desk') AS entity,
           NULL::text  AS priority,
           to_char(due_at, 'YYYY-MM-DD') AS due_at,
           date_part('day', now() - created_at)::int AS age_days
      FROM pending
     WHERE assignee_staff_id IS NULL
     ORDER BY due_at ASC NULLS LAST, created_at ASC
     LIMIT 50
  ) unowned_desk`;

/**
 * Today's throughput per staffer — the same activity types and the same
 * distinct-scan key the station boards count, so a staffer's number here matches
 * what their station shows them.
 */
const SCANS_SQL = `
  SELECT sal.staff_id::int AS staff_id,
         count(DISTINCT coalesce(sal.shipment_id::text, sal.scan_ref, sal.id::text))::int AS scans
    FROM station_activity_logs sal
   WHERE sal.organization_id = $1
     AND sal.staff_id IS NOT NULL
     AND sal.activity_type IN ('TRACKING_SCANNED', 'FNSKU_SCANNED', 'PACK_SCAN', 'PACK_COMPLETED', 'FBA_READY')
     AND (sal.created_at AT TIME ZONE 'America/Los_Angeles')::date = $2::date
   GROUP BY sal.staff_id`;

function asInt(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function splitLoad(rows: ReadonlyArray<Record<string, unknown>>, source: UnownedItem['source']) {
  const byStaff = new Map<number, { pending: number; urgent: number; overdue: number }>();
  let unassigned = 0;
  const unowned: UnownedItem[] = [];
  for (const raw of rows) {
    const row = raw as unknown as LoadRow;
    if (row.kind === 'row') {
      unowned.push({
        source,
        what: asText(row.what) ?? '—',
        entity: asText(row.entity) ?? '—',
        priority: asText(row.priority) ?? '—',
        due: asText(row.due_at) ?? 'no due date',
        ageDays: row.age_days === null || row.age_days === undefined ? null : asInt(row.age_days),
      });
      continue;
    }
    const pending = asInt(row.pending);
    const staffId = row.assignee_staff_id === null || row.assignee_staff_id === undefined
      ? null
      : asInt(row.assignee_staff_id);
    if (staffId === null) {
      unassigned += pending;
      continue;
    }
    byStaff.set(staffId, {
      pending,
      urgent: asInt(row.urgent),
      overdue: asInt(row.overdue),
    });
  }
  return { byStaff, unassigned, unowned };
}

/** Verdict word for a roster row. Free capacity is what the owner is scanning for. */
function verdict(free: number, workdayMinutes: number): string {
  if (free >= workdayMinutes * 0.5) return 'Open';
  if (free > 0) return 'Busy';
  return 'Full';
}

export interface DelegationPlan {
  roster: RosterEntry[];
  unowned: UnownedItem[];
  unassignedPending: number;
  derivedCount: number;
  workdayMinutes: number;
  ranked: RankedGap[];
}

/** The four reads plus the gap ranking, joined. Exported so a test can pin the join. */
export async function loadDelegationPlan(
  ctx: AssistantToolCtx,
  deps: Pick<AssistantToolDeps, 'query'>,
  now: Date,
): Promise<DelegationPlan> {
  const day = operatorDay(now);
  const [staffRes, floorRes, deskRes, scanRes, gapRows, workdayMinutes] = await Promise.all([
    deps.query(ctx.organizationId, STAFF_SQL, [ctx.organizationId]),
    deps.query(ctx.organizationId, FLOOR_SQL, [ctx.organizationId]),
    deps.query(ctx.organizationId, DESK_SQL, [ctx.organizationId]),
    deps.query(ctx.organizationId, SCANS_SQL, [ctx.organizationId, day]),
    loadRoiGapRows(ctx, deps),
    loadWorkdayMinutes(ctx, deps),
  ]);

  const floor = splitLoad(floorRes.rows, 'Floor');
  const desk = splitLoad(deskRes.rows, 'Desk');
  const scans = new Map<number, number>();
  for (const raw of scanRes.rows) {
    scans.set(asInt(raw.staff_id), asInt(raw.scans));
  }

  let derivedCount = 0;
  const roster: RosterEntry[] = staffRes.rows.map((raw) => {
    const row = raw as unknown as StaffRow;
    const staffId = asInt(row.staff_id);
    const assigned = (Array.isArray(row.stations) ? row.stations : [])
      .map((s) => String(s).trim().toUpperCase())
      .filter((s): s is StationName => s === 'TECH' || s === 'PACK' || s === 'UNBOX' || s === 'SALES' || s === 'FBA');
    const stationsDerived = assigned.length === 0;
    if (stationsDerived) derivedCount += 1;
    const stations = stationsDerived ? [stationFromEmployeeId(row.employee_id)] : assigned;
    const f = floor.byStaff.get(staffId) ?? { pending: 0, urgent: 0, overdue: 0 };
    const d = desk.byStaff.get(staffId) ?? { pending: 0, urgent: 0, overdue: 0 };
    const pendingTasks = f.pending + d.pending;
    return {
      staffId,
      name: asText(row.name) ?? `Staff #${staffId}`,
      role: asText(row.role) ?? '—',
      stations,
      stationsDerived,
      floorTasks: f.pending,
      deskTasks: d.pending,
      urgent: f.urgent + d.urgent,
      overdue: f.overdue + d.overdue,
      scansToday: scans.get(staffId) ?? 0,
      pendingTasks,
      freeMinutes: freeMinutes(workdayMinutes, pendingTasks),
    };
  });

  return {
    roster,
    unowned: [...floor.unowned, ...desk.unowned].slice(0, 50),
    unassignedPending: floor.unassigned + desk.unassigned,
    derivedCount,
    workdayMinutes,
    ranked: rankGaps(gapRows),
  };
}

/** Eligible staff for a gap's station, least loaded first. */
export function eligibleFor(roster: readonly RosterEntry[], station: string): RosterEntry[] {
  return roster
    .filter((r) => r.stations.includes(station as StationName))
    .slice()
    .sort((a, b) => b.freeMinutes - a.freeMinutes || a.pendingTasks - b.pendingTasks || a.name.localeCompare(b.name));
}

const DELEGATION_QUESTION =
  'Which staff can I delegate to attack the highest ROIs in terms of pending tasks?';

export async function buildDelegationPlanReport(
  args: { gapId?: string; station?: string },
  ctx: AssistantToolCtx,
  deps: Pick<AssistantToolDeps, 'query'>,
  now: Date = new Date(),
): Promise<ToolArtifactEnvelope> {
  const plan = await loadDelegationPlan(ctx, deps, now);
  const { roster, workdayMinutes } = plan;

  const standards: ArtifactReportStandard[] = [
    {
      label: 'Minutes per pending task',
      value: String(ASSUMED_MINUTES_PER_TASK),
      unit: 'min/task',
      note: 'ASSUMPTION, not a measurement — neither work_assignments nor ops_plan_tasks records an expected duration.',
    },
    {
      label: 'Workday',
      value: String(workdayMinutes),
      unit: 'min/person/day',
      note:
        workdayMinutes === DEFAULT_WORKDAY_MINUTES
          ? 'org_pack_capacity.workday_minutes, or the 480-minute default when unset.'
          : 'From org_pack_capacity.workday_minutes.',
    },
    {
      label: 'Free capacity formula',
      value: 'workday − tasks × 20',
      unit: null,
      note: 'free_minutes = workday_minutes − (pending_tasks × ASSUMED_MINUTES_PER_TASK). Pending = floor work OPEN/ASSIGNED/IN_PROGRESS plus desk tasks open/in_progress.',
    },
    {
      label: 'Gap → station',
      value: 'declared map',
      unit: null,
      note: Object.entries(GAP_STATION)
        .map(([gap, station]) => `${gap}→${station}`)
        .join(', '),
    },
  ];

  // Optional narrowing: the owner may name a gap or a station explicitly.
  const wantedGap = args.gapId?.trim();
  const wantedStation = args.station?.trim().toUpperCase();
  const gapPool = wantedGap
    ? plan.ranked.filter((g) => g.id === wantedGap)
    : wantedStation
      ? plan.ranked.filter((g) => (GAP_STATION[g.id] ?? 'TECH') === wantedStation)
      : plan.ranked;
  const targets = gapPool.slice(0, 3);

  if (targets.length === 0) {
    return reportEnvelope(
      emptyReport({
        title: 'Who to delegate the highest ROIs to',
        question: DELEGATION_QUESTION,
        now,
        scope: wantedGap
          ? `Gap "${wantedGap}"`
          : wantedStation
            ? `Station ${wantedStation}`
            : 'All six operating gaps',
        label: 'Gaps to delegate',
        note: wantedGap || wantedStation
          ? 'That gap or station has nothing stuck right now, so there is nothing to delegate against it.'
          : 'All six gaps came back empty — nothing is stuck, so there is nothing to delegate. Roster load is still readable via "Which staff have the most free capacity right now?".',
        standards,
      }),
      wantedGap || wantedStation
        ? 'Nothing is stuck for that gap or station, so there is nothing to delegate.'
        : 'Nothing is stuck: all six operating gaps are empty, so there is nothing to delegate right now.',
    );
  }

  const topGap = targets[0]!;
  const topStation = GAP_STATION[topGap.id] ?? 'TECH';
  const topEligible = eligibleFor(roster, topStation);
  const recommended = topEligible[0] ?? null;

  const rosterPending = roster.reduce((s, r) => s + r.pendingTasks, 0);
  const mostLoaded = roster.length
    ? roster.slice().sort((a, b) => b.pendingTasks - a.pendingTasks || a.name.localeCompare(b.name))[0]!
    : null;

  const kpis: ArtifactReportKpi[] = [
    {
      id: 'recommended',
      label: 'Send first',
      value: recommended ? recommended.name : `Nobody on ${topStation}`,
      status: 'neutral',
      definition: `The eligible staffer with the most free capacity for the top gap's station (${topStation}). Eligibility is staff_stations, with an employee_id prefix fallback.`,
    },
    {
      id: 'recommended_free',
      label: 'Their free capacity',
      value: recommended ? minutes(Math.max(0, recommended.freeMinutes)) : '—',
      unit: null,
      status: recommended ? statusAbove(recommended.freeMinutes, workdayMinutes * 0.5, 1) : 'neutral',
      definition: `${workdayMinutes}-minute workday minus ${ASSUMED_MINUTES_PER_TASK} minutes per pending task. Good at half a day or better; bad once the assumed load fills the day.`,
    },
    {
      id: 'top_gap',
      label: 'Top gap',
      value: topGap.label,
      status: 'neutral',
      definition: 'The highest-priority gap from the ROI ranking (units × ageWeight), cleared by the station in the declared gap→station map.',
    },
    {
      id: 'eligible_staff',
      label: `Eligible on ${topStation}`,
      value: count(topEligible.length),
      unit: 'staff',
      status: statusAbove(topEligible.length, 2, 1),
      definition: `Active staff whose stations include ${topStation}. One deep is a single point of failure; zero means the station is unstaffed.`,
    },
    {
      id: 'roster_pending',
      label: 'Roster pending',
      value: count(rosterPending),
      unit: 'tasks',
      status: 'neutral',
      definition: 'All pending floor assignments plus desk tasks currently owned by an active staffer.',
    },
    {
      id: 'unassigned_pending',
      label: 'Unowned pending',
      value: count(plan.unassignedPending),
      unit: 'tasks',
      status: statusBelow(plan.unassignedPending, 0, 5),
      definition: 'Pending floor and desk work with a NULL assignee — NOBODY owns these, so nobody will finish them.',
    },
    {
      id: 'most_loaded',
      label: 'Most loaded',
      value: mostLoaded ? `${mostLoaded.name} · ${mostLoaded.pendingTasks} tasks` : '—',
      status: 'neutral',
      definition: 'The active staffer holding the most pending tasks across floor and desk. Do not stack the top gap here.',
    },
  ];

  const matchSection: ArtifactReportSection = {
    title: 'Who to send at the top 3 gaps',
    note: 'Staff listed least-loaded first, by free capacity. Eligibility comes from the declared gap→station map.',
    columns: [
      { key: 'gap', label: 'Gap' },
      { key: 'station', label: 'Station' },
      { key: 'units', label: 'Stuck', align: 'right' },
      { key: 'effort', label: 'Effort', align: 'right', unit: 'min' },
      { key: 'staff', label: 'Staff (best first)' },
      { key: 'best_free', label: 'Best free', align: 'right', unit: 'min' },
      { key: 'note', label: 'Note' },
    ],
    rows: targets.map((gap) => {
      const station = GAP_STATION[gap.id] ?? 'TECH';
      const eligible = eligibleFor(roster, station);
      return {
        gap: gap.label,
        station,
        units: count(gap.units),
        effort: minutes(gap.effortMinutes),
        staff: eligible.length ? eligible.map((r) => r.name).join(', ').slice(0, 300) : '—',
        best_free: eligible.length ? minutes(Math.max(0, eligible[0]!.freeMinutes)) : '—',
        note: eligible.length ? '' : `nobody assigned to ${station}`,
      };
    }),
  };

  const rosterSection: ArtifactReportSection = {
    title: 'Roster load',
    note: `Active staff only. Free = ${workdayMinutes} min − ${ASSUMED_MINUTES_PER_TASK} min per pending task.`,
    columns: [
      { key: 'staff', label: 'Staff' },
      { key: 'role', label: 'Role' },
      { key: 'stations', label: 'Stations' },
      { key: 'floor_tasks', label: 'Floor', align: 'right' },
      { key: 'desk_tasks', label: 'Desk', align: 'right' },
      { key: 'urgent', label: 'Urgent', align: 'right' },
      { key: 'overdue', label: 'Overdue', align: 'right' },
      { key: 'scans_today', label: 'Scans today', align: 'right' },
      { key: 'free', label: 'Free', align: 'right', unit: 'min' },
      { key: 'verdict', label: 'Verdict' },
    ],
    rows: roster.slice(0, 300).map((r) => ({
      staff: r.name,
      role: r.role,
      stations: `${r.stations.join(', ')}${r.stationsDerived ? ' (derived)' : ''}`,
      floor_tasks: count(r.floorTasks),
      desk_tasks: count(r.deskTasks),
      urgent: count(r.urgent),
      overdue: count(r.overdue),
      scans_today: count(r.scansToday),
      free: minutes(Math.max(0, r.freeMinutes)),
      verdict: verdict(r.freeMinutes, workdayMinutes),
    })),
    totals: {
      staff: `${roster.length} active`,
      role: '—',
      stations: '—',
      floor_tasks: count(roster.reduce((s, r) => s + r.floorTasks, 0)),
      desk_tasks: count(roster.reduce((s, r) => s + r.deskTasks, 0)),
      urgent: count(roster.reduce((s, r) => s + r.urgent, 0)),
      overdue: count(roster.reduce((s, r) => s + r.overdue, 0)),
      scans_today: count(roster.reduce((s, r) => s + r.scansToday, 0)),
      free: minutes(roster.reduce((s, r) => s + Math.max(0, r.freeMinutes), 0)),
      verdict: '—',
    },
  };

  const unownedSection: ArtifactReportSection = {
    title: 'Unowned pending work',
    note: 'Pending items with a NULL assignee, floor first. Desk rows carry no priority — ops_plan_tasks has no priority column.',
    columns: [
      { key: 'source', label: 'Source' },
      { key: 'what', label: 'What' },
      { key: 'entity', label: 'Entity' },
      { key: 'priority', label: 'Priority' },
      { key: 'due', label: 'Due' },
      { key: 'age', label: 'Age', align: 'right', unit: 'days' },
    ],
    rows: plan.unowned.map((item) => ({
      source: item.source,
      what: item.what.slice(0, 300),
      entity: item.entity.slice(0, 300),
      priority: item.priority,
      due: item.due,
      age: item.ageDays === null ? '—' : count(item.ageDays),
    })),
  };

  const headlineHint = recommended
    ? `${topGap.label} · ${topStation} · ${minutes(Math.max(0, recommended.freeMinutes))} free`
    : `${topGap.label} · nobody is assigned to ${topStation}`;

  const report: ArtifactReport = {
    kind: 'report',
    title: 'Who to delegate the highest ROIs to',
    question: DELEGATION_QUESTION,
    asOf: operatorStamp(now),
    scope: `Top ${targets.length} gap${targets.length === 1 ? '' : 's'} · ${roster.length} active staff · pending floor and desk work`,
    headline: {
      value: (recommended ? recommended.name : topStation).slice(0, 60),
      unit: null,
      label: recommended ? 'Best first delegation' : 'Station with nobody on it',
      hint: headlineHint.slice(0, 200),
    },
    kpis,
    sections: [matchSection, rosterSection, unownedSection],
    standards: standards.slice(0, 8),
    notes: [
      `free_minutes is capacity MINUS an assumed ${ASSUMED_MINUTES_PER_TASK} minutes per pending task. That 20 is an assumption, printed here so it can be argued with — no table in this schema records a per-task duration.`,
      `Station eligibility comes from staff_stations. ${plan.derivedCount === 0 ? 'Every listed staffer has an assigned station.' : `${plan.derivedCount} staffer${plan.derivedCount === 1 ? ' has' : 's have'} no staff_stations row, so their station was DERIVED from the employee_id prefix and is marked "(derived)".`}`,
      'Delegating is a human action. This report names WHO; the assignment itself is made with the existing verb, POST /api/tasks (permission work_orders.claim), which this report does not call.',
      'ops_plan_tasks has no priority column, so desk urgency comes from due_at only: "urgent" means due within a day, "overdue" means already past.',
      'Gap counts are live row counts from the ROI ranking (units × ageWeight); no dollar value is attached to any of them.',
    ],
    followUps: [
      {
        label: 'Assign the top gap',
        question: `Throw ${recommended ? recommended.name : `someone on ${topStation}`} a task for the ${topGap.label} backlog`.slice(0, 300),
      },
      { label: 'Who is free now', question: 'Which staff have the most free capacity right now?' },
    ],
  };

  return reportEnvelope(
    report,
    recommended
      ? `Send ${recommended.name} (${topStation}, ${minutes(Math.max(0, recommended.freeMinutes))} free, ${recommended.pendingTasks} pending) at ${topGap.label} — ${count(topGap.units)} stuck, about ${minutes(topGap.effortMinutes)} to clear. ${count(topEligible.length)} staff are eligible on ${topStation}; ${count(plan.unassignedPending)} pending items have no owner at all.`
      : `The top gap is ${topGap.label}, cleared at ${topStation} — and nobody is assigned to ${topStation}, so there is no one to delegate it to. That absence is the finding: staff the station or reassign the gap. ${count(plan.unassignedPending)} pending items also have no owner.`,
  );
}

export const delegationPlanInput = z.object({
  gapId: z.string().max(60).optional(),
  station: z.string().max(20).optional(),
});
