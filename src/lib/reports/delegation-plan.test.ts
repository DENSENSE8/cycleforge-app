/**
 * DB-free unit tests for the delegation report.
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/reports/delegation-plan.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionArtifactSchema } from '@/lib/assistant/ui-artifacts';
import type { AssistantToolCtx, AssistantToolQueryResult } from '@/lib/assistant/tools/types';
import type { OrgId } from '@/lib/tenancy/constants';
import { rankGaps, type RoiGapRow } from './roi-rank';
import {
  ASSUMED_MINUTES_PER_TASK,
  buildDelegationPlanReport,
  eligibleFor,
  freeMinutes,
  stationFromEmployeeId,
  type RosterEntry,
} from './delegation-plan';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;
const CTX: AssistantToolCtx = {
  organizationId: ORG,
  staffId: 7,
  permissions: new Set(['work_orders.view']),
};
const NOW = new Date('2026-09-06T18:00:00Z');

interface Fake {
  gaps?: Readonly<Record<string, { units: number; oldest: number | null }>>;
  workdayMinutes?: number | null;
  staff?: Array<Record<string, unknown>>;
  floor?: Array<Record<string, unknown>>;
  desk?: Array<Record<string, unknown>>;
  scans?: Array<Record<string, unknown>>;
}

function fakeQuery(f: Fake) {
  const seen: Array<{ orgId: string; text: string; params: ReadonlyArray<unknown> }> = [];
  const query = async (
    orgId: OrgId,
    text: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<AssistantToolQueryResult> => {
    seen.push({ orgId, text, params: params ?? [] });
    if (text.includes('org_pack_capacity')) {
      return { rows: f.workdayMinutes == null ? [] : [{ workday_minutes: f.workdayMinutes }] };
    }
    if (text.includes('FROM staff s')) return { rows: f.staff ?? [] };
    if (text.includes('work_assignments')) return { rows: f.floor ?? [] };
    if (text.includes('ops_plan_tasks')) return { rows: f.desk ?? [] };
    if (text.includes('station_activity_logs')) return { rows: f.scans ?? [] };
    const gaps = f.gaps ?? {};
    const id = text.includes('serial_unit_listings')
      ? 'unlisted_units'
      : text.includes('mv_dead_stock')
        ? 'dead_stock'
        : text.includes('orders_exceptions')
          ? 'open_order_exceptions'
          : text.includes('receiving_exceptions')
            ? 'open_receiving_exceptions'
            : text.includes("'ON_HOLD'")
              ? 'units_on_hold'
              : 'repairs_in_flight';
    const hit = gaps[id];
    return { rows: [{ units: hit?.units ?? 0, oldest_days: hit?.oldest ?? null }] };
  };
  return { query, seen };
}

function entry(over: Partial<RosterEntry> & { name: string }): RosterEntry {
  return {
    staffId: 1,
    role: 'tech',
    stations: ['TECH'],
    stationsDerived: false,
    floorTasks: 0,
    deskTasks: 0,
    urgent: 0,
    overdue: 0,
    scansToday: 0,
    pendingTasks: 0,
    freeMinutes: 480,
    ...over,
  };
}

test('station fallback derives PACK from employee_id PACK-07', () => {
  assert.equal(stationFromEmployeeId('PACK-07'), 'PACK');
  assert.equal(stationFromEmployeeId('unbox-3'), 'UNBOX');
  assert.equal(stationFromEmployeeId('SALES99'), 'SALES');
  assert.equal(stationFromEmployeeId('FBA-1'), 'FBA');
  // Anything unrecognized (or missing) lands on the catch-all bench.
  assert.equal(stationFromEmployeeId('E-1042'), 'TECH');
  assert.equal(stationFromEmployeeId(null), 'TECH');
});

test('free_minutes is the workday minus the declared 20 minutes per pending task', () => {
  assert.equal(ASSUMED_MINUTES_PER_TASK, 20);
  assert.equal(freeMinutes(480, 0), 480);
  assert.equal(freeMinutes(480, 6), 360);
  // Overbooked staff go negative on purpose: "0 free" and "3 hours over" are
  // different instructions to an owner.
  assert.equal(freeMinutes(480, 30), -120);
});

test('eligibleFor lists the least loaded eligible staffer first and excludes other stations', () => {
  const roster = [
    entry({ staffId: 1, name: 'Loaded', pendingTasks: 20, freeMinutes: 80 }),
    entry({ staffId: 2, name: 'Free', pendingTasks: 2, freeMinutes: 440 }),
    entry({ staffId: 3, name: 'Packer', stations: ['PACK'], freeMinutes: 480 }),
  ];
  assert.deepEqual(eligibleFor(roster, 'TECH').map((r) => r.name), ['Free', 'Loaded']);
  assert.deepEqual(eligibleFor(roster, 'PACK').map((r) => r.name), ['Packer']);
  assert.deepEqual(eligibleFor(roster, 'SALES'), []);
});

test('the two reports agree on the top gap for identical rows (one ranking implementation)', async () => {
  // Anti-duplication proof: delegation imports rankGaps rather than restating
  // the formula, so a change to the formula cannot move only one report.
  const rows: RoiGapRow[] = [
    { id: 'open_receiving_exceptions', label: 'Open receiving exceptions', units: 30, unit: 'units', oldestDays: 0, why: 'w', question: 'q' },
    { id: 'dead_stock', label: 'Dead stock (90+ days dormant)', units: 20, unit: 'skus', oldestDays: 60, why: 'w', question: 'q' },
  ];
  const expected = rankGaps(rows)[0]!;
  assert.equal(expected.id, 'dead_stock', '20 × 3.0 must beat 30 × 1.0');

  const { query } = fakeQuery({
    gaps: {
      open_receiving_exceptions: { units: 30, oldest: 0 },
      dead_stock: { units: 20, oldest: 60 },
    },
    staff: [{ staff_id: 4, name: 'Sam Sales', role: 'sales', employee_id: 'SALES-01', stations: ['SALES'] }],
  });
  const out = await buildDelegationPlanReport({}, CTX, { query }, NOW);
  if (out.artifact.kind !== 'report') throw new Error('expected report');
  assert.equal(out.artifact.kpis.find((k) => k.id === 'top_gap')?.value, expected.label);
  // And it routes that gap to the declared station, not to whoever is idle.
  assert.equal(out.artifact.sections[0]?.rows[0]?.station, 'SALES');
  assert.equal(out.artifact.headline.value, 'Sam Sales');
});

test('report: joins four sources into roster load, KPIs and the unowned list', async () => {
  const { query, seen } = fakeQuery({
    gaps: { open_order_exceptions: { units: 12, oldest: 10 } },
    workdayMinutes: 480,
    staff: [
      { staff_id: 1, name: 'Pat Packer', role: 'packer', employee_id: 'PACK-07', stations: [] },
      { staff_id: 2, name: 'Tia Tech', role: 'technician', employee_id: 'E-9', stations: ['TECH'] },
    ],
    floor: [
      { kind: 'agg', assignee_staff_id: 1, pending: 5, urgent: 2, overdue: 1 },
      { kind: 'agg', assignee_staff_id: null, pending: 3, urgent: 0, overdue: 0 },
      { kind: 'row', what: 'PACK', entity: 'orders #55', priority: '10', due_at: '2026-09-07', age_days: 4 },
    ],
    desk: [
      { kind: 'agg', assignee_staff_id: 2, pending: 1, urgent: 1, overdue: 0 },
      { kind: 'agg', assignee_staff_id: null, pending: 2, urgent: 0, overdue: 0 },
      { kind: 'row', what: 'Reconcile pallet count', entity: 'UNBOX', priority: null, due_at: null, age_days: 9 },
    ],
    scans: [{ staff_id: 1, scans: 41 }],
  });
  const out = await buildDelegationPlanReport({}, CTX, { query }, NOW);
  const report = out.artifact;
  if (report.kind !== 'report') throw new Error('expected report');

  // Pat has 5 pending ⇒ 480 − 100 = 380 free, and is eligible for PACK only via
  // the employee_id fallback — which the report marks as derived.
  assert.equal(report.headline.value, 'Pat Packer');
  assert.equal(report.headline.label, 'Best first delegation');
  assert.match(report.headline.hint ?? '', /Open order exceptions · PACK · 6h 20m free/);
  assert.equal(report.kpis.find((k) => k.id === 'recommended_free')?.value, '6h 20m');
  assert.equal(report.kpis.find((k) => k.id === 'eligible_staff')?.value, '1');
  assert.equal(report.kpis.find((k) => k.id === 'roster_pending')?.value, '6');
  assert.equal(report.kpis.find((k) => k.id === 'unassigned_pending')?.value, '5');
  assert.equal(report.kpis.find((k) => k.id === 'unassigned_pending')?.status, 'watch');
  assert.equal(report.kpis.find((k) => k.id === 'most_loaded')?.value, 'Pat Packer · 5 tasks');
  for (const kpi of report.kpis) assert.ok(kpi.definition.length > 10, `${kpi.id} needs a definition`);

  const rosterSection = report.sections[1]!;
  assert.equal(rosterSection.title, 'Roster load');
  const pat = rosterSection.rows.find((r) => r.staff === 'Pat Packer')!;
  assert.equal(pat.stations, 'PACK (derived)');
  assert.equal(pat.floor_tasks, '5');
  assert.equal(pat.desk_tasks, '0');
  assert.equal(pat.scans_today, '41');
  assert.equal(pat.verdict, 'Open');
  assert.equal(rosterSection.rows.find((r) => r.staff === 'Tia Tech')?.stations, 'TECH');
  assert.equal(rosterSection.totals?.floor_tasks, '5');
  assert.equal(rosterSection.totals?.desk_tasks, '1');

  // Unowned work is listed as rows, floor first, and counted in the KPI.
  const unowned = report.sections[2]!;
  assert.equal(unowned.title, 'Unowned pending work');
  assert.deepEqual(unowned.rows.map((r) => r.source), ['Floor', 'Desk']);
  assert.equal(unowned.rows[0]?.entity, 'orders #55');
  assert.equal(unowned.rows[1]?.priority, '—');
  assert.equal(unowned.rows[1]?.due, 'no due date');
  assert.equal(unowned.rows[1]?.age, '9');

  // Rows never carry a key the columns do not declare.
  for (const section of report.sections) {
    const keys = new Set(section.columns.map((c) => c.key));
    for (const row of section.rows) {
      for (const key of Object.keys(row)) assert.ok(keys.has(key), `${section.title}: stray key ${key}`);
    }
    if (section.totals) {
      for (const key of Object.keys(section.totals)) assert.ok(keys.has(key), `${section.title}: stray total ${key}`);
    }
  }

  // Printed standards and the honesty notes.
  assert.ok(report.standards.some((s) => s.value === '20' && /ASSUMPTION/.test(s.note ?? '')));
  assert.ok(report.standards.some((s) => /open_order_exceptions→PACK/.test(s.note ?? '')));
  assert.ok(report.notes.some((n) => /1 staffer has no staff_stations row/.test(n)));
  assert.ok(report.notes.some((n) => /POST \/api\/tasks/.test(n) && /work_orders\.claim/.test(n)));
  assert.ok(report.notes.some((n) => /ops_plan_tasks has no priority column/.test(n)));

  assert.deepEqual(report.followUps, [
    { label: 'Assign the top gap', question: 'Throw Pat Packer a task for the Open order exceptions backlog' },
    { label: 'Who is free now', question: 'Which staff have the most free capacity right now?' },
  ]);
  assert.ok(sessionArtifactSchema.safeParse(report).success);

  // Exactly four load reads plus six gap counts plus the capacity read.
  assert.equal(seen.length, 11);
  for (const call of seen) {
    assert.equal(call.orgId, ORG);
    assert.equal(call.params[0], ORG);
    assert.match(call.text, /organization_id = \$1/);
  }
  // Today's scans are scoped to the operator day, not the UTC day.
  assert.equal(seen.find((c) => c.text.includes('station_activity_logs'))?.params[1], '2026-09-06');
});

test('report: an empty station is the finding, not a crash', async () => {
  const { query } = fakeQuery({
    gaps: { open_receiving_exceptions: { units: 8, oldest: 3 } },
    // Nobody is on UNBOX, which is the station that clears receiving exceptions.
    staff: [{ staff_id: 1, name: 'Tia Tech', role: 'technician', employee_id: 'E-9', stations: ['TECH'] }],
  });
  const out = await buildDelegationPlanReport({}, CTX, { query }, NOW);
  const report = out.artifact;
  if (report.kind !== 'report') throw new Error('expected report');
  assert.equal(report.headline.value, 'UNBOX');
  assert.equal(report.headline.label, 'Station with nobody on it');
  assert.match(report.headline.hint ?? '', /nobody is assigned to UNBOX/);
  assert.equal(report.kpis.find((k) => k.id === 'recommended')?.value, 'Nobody on UNBOX');
  assert.equal(report.kpis.find((k) => k.id === 'recommended_free')?.value, '—');
  assert.equal(report.kpis.find((k) => k.id === 'eligible_staff')?.status, 'bad');
  assert.equal(report.sections[0]?.rows[0]?.note, 'nobody assigned to UNBOX');
  assert.equal(report.sections[0]?.rows[0]?.staff, '—');
  assert.match(out.summary, /nobody is assigned to UNBOX/);
  assert.ok(sessionArtifactSchema.safeParse(report).success);
});

test('report: gapId narrows to one gap; a gap with nothing stuck renders the zero report', async () => {
  const fake = {
    gaps: {
      unlisted_units: { units: 40, oldest: 0 },
      units_on_hold: { units: 5, oldest: 0 },
    },
    staff: [{ staff_id: 1, name: 'Tia Tech', role: 'technician', employee_id: 'E-9', stations: ['TECH'] }],
  } satisfies Fake;

  const narrowed = await buildDelegationPlanReport(
    { gapId: 'units_on_hold' },
    CTX,
    { query: fakeQuery(fake).query },
    NOW,
  );
  if (narrowed.artifact.kind !== 'report') throw new Error('expected report');
  assert.equal(narrowed.artifact.sections[0]?.rows.length, 1);
  assert.equal(narrowed.artifact.kpis.find((k) => k.id === 'top_gap')?.value, 'Units on hold');

  const missing = await buildDelegationPlanReport(
    { gapId: 'dead_stock' },
    CTX,
    { query: fakeQuery(fake).query },
    NOW,
  );
  if (missing.artifact.kind !== 'report') throw new Error('expected report');
  assert.equal(missing.artifact.headline.value, '0');
  assert.equal(missing.artifact.sections.length, 0);
  assert.match(missing.summary, /nothing to delegate/);
  assert.ok(sessionArtifactSchema.safeParse(missing.artifact).success);
});
