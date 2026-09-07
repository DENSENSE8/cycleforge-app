/**
 * DB-free unit tests for the packing performance report.
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/reports/packing-performance.test.ts
 *
 * The fake `deps.query` returns fixed rows shaped like node-pg output (numerics
 * as strings), so these tests pin the arithmetic an owner reads — earned vs
 * handle, wait with the break excluded, and a totals row that reconciles with
 * its own columns.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPackingPerformanceReport, BREAK_THRESHOLD_MINUTES } from './packing-performance';
import { sessionArtifactSchema, type ArtifactReport } from '@/lib/assistant/ui-artifacts';
import type { AssistantToolCtx, AssistantToolQueryResult } from '@/lib/assistant/tools/types';

const ORG = '11111111-2222-3333-4444-555555555555';
const CTX: AssistantToolCtx = { organizationId: ORG, staffId: 7, permissions: new Set(['operations.view']) };
const NOW = new Date('2026-09-06T18:00:00Z'); // 2026-09-06 11:00 PT
const DAY = '2026-09-06';

interface Capture {
  orgIds: string[];
  sql: string[];
  params: ReadonlyArray<unknown>[];
}

type QueryFake = {
  capacity?: Array<Record<string, unknown>>;
  staff?: Array<Record<string, unknown>>;
  completions?: Array<Record<string, unknown>>;
};

function fakeQuery(fixtures: QueryFake): {
  query: (orgId: string, sql: string, params?: ReadonlyArray<unknown>) => Promise<AssistantToolQueryResult>;
  cap: Capture;
} {
  const cap: Capture = { orgIds: [], sql: [], params: [] };
  return {
    cap,
    query: async (orgId, sql, params) => {
      cap.orgIds.push(orgId);
      cap.sql.push(sql);
      cap.params.push(params ?? []);
      if (sql.includes('org_pack_capacity')) return { rows: fixtures.capacity ?? [] };
      if (sql.includes('ILIKE')) return { rows: fixtures.staff ?? [] };
      return { rows: fixtures.completions ?? [] };
    },
  };
}

/** One PACK_COMPLETED row as the query emits it. */
function completion(over: Partial<Record<string, unknown>> & { sal_id: number }): Record<string, unknown> {
  return {
    staff_id: 7,
    packer: 'Jane Packer',
    completed_at: `${DAY}T09:00:00`,
    completed_hm: '09:00',
    pack_tier: 'SMALL',
    tier_source: 'rules',
    standard_minutes: '5',
    handle_minutes: '6',
    wait_minutes: null,
    attended_minutes: '240',
    item_number: '1122334455',
    sku: 'SKU-1',
    product_title: 'Bose Solo 5 soundbar',
    scan_ref: '1Z999',
    ...over,
  };
}

/**
 * Jane's day: small (6m handle, first box so no wait), medium (12m handle, 2m
 * wait), big (55m handle after a 120m gap — a break, not queue wait), and a
 * completion with no start scan at all.
 */
const JANE_ROWS: Array<Record<string, unknown>> = [
  completion({
    sal_id: 4,
    completed_at: `${DAY}T12:00:00`,
    completed_hm: '12:00',
    pack_tier: 'SMALL',
    standard_minutes: '5',
    handle_minutes: null,
    wait_minutes: null,
    item_number: null,
    sku: null,
    product_title: null,
    scan_ref: 'TRK-777',
  }),
  completion({
    sal_id: 3,
    completed_at: `${DAY}T11:30:00`,
    completed_hm: '11:30',
    pack_tier: 'LARGE',
    tier_source: 'sku_profile',
    standard_minutes: '60',
    handle_minutes: '55',
    wait_minutes: '120',
    product_title: 'Bose Lifestyle 650 home theater system with omnijewel speakers and console',
  }),
  completion({
    sal_id: 2,
    completed_at: `${DAY}T09:20:00`,
    completed_hm: '09:20',
    pack_tier: 'MEDIUM',
    standard_minutes: '15',
    handle_minutes: '12',
    wait_minutes: '2',
    item_number: null,
    sku: 'SKU-MED',
  }),
  completion({ sal_id: 1 }),
];

function reportOf(envelope: { artifact: unknown }): ArtifactReport {
  const parsed = sessionArtifactSchema.safeParse(envelope.artifact);
  assert.equal(parsed.success, true, 'artifact must satisfy sessionArtifactSchema');
  assert.equal(parsed.success && parsed.data.kind, 'report');
  return envelope.artifact as ArtifactReport;
}

function kpi(report: ArtifactReport, id: string): { value: string; status: string; definition: string } {
  const found = report.kpis.find((k) => k.id === id);
  assert.ok(found, `missing kpi ${id}`);
  return { value: found.value, status: found.status, definition: found.definition };
}

test('single packer: earned/handle math, break excluded from wait, unpaired counted', async () => {
  const { query, cap } = fakeQuery({
    capacity: [{ packer_headcount: 2, workday_minutes: 480, daily_medium_target: 60, daily_large_target: 16 }],
    staff: [{ id: 7, name: 'Jane Packer', role: 'packer' }],
    completions: JANE_ROWS,
  });

  const envelope = await buildPackingPerformanceReport({ staffName: 'jane' }, CTX, { query }, NOW);
  const report = reportOf(envelope);

  // Every statement is org-scoped, and the resolved staff id becomes $3.
  assert.deepEqual(new Set(cap.orgIds), new Set([ORG]));
  const completionParams = cap.params[cap.params.length - 1];
  assert.deepEqual(completionParams, [ORG, DAY, 7]);
  assert.ok(cap.sql.some((s) => s.includes('AND sal.staff_id = $3')));

  assert.equal(report.question, "What is Jane Packer's packing performance today?");
  assert.equal(report.scope, `Jane Packer · ${DAY} (PT)`);
  assert.equal(report.headline.value, '4');
  assert.equal(report.headline.hint, '2 small · 1 medium · 1 big');

  // earned = 5 + 15 + 60 + 5 = 85; handle = 6 + 12 + 55 = 73 (unpaired adds 0).
  assert.equal(kpi(report, 'boxes').value, '4');
  assert.equal(kpi(report, 'earned_minutes').value, '1h 25m');
  assert.equal(kpi(report, 'handle_minutes').value, '1h 13m');

  // The 120-minute gap is a break: wait is the 2-minute gap alone.
  const wait = kpi(report, 'wait_minutes');
  assert.equal(wait.value, '2m');
  assert.equal(wait.status, 'good'); // 0.5 min/box
  assert.match(report.notes[0], /breaks, not wait: 1 today\./);
  assert.ok(report.notes[0].includes(String(BREAK_THRESHOLD_MINUTES)));

  // 85/73 = 116%; 73/240 attended = 30%; 73/4 = 18m per box; 480 - 73 left.
  assert.equal(kpi(report, 'efficiency').value, '116%');
  assert.equal(kpi(report, 'efficiency').status, 'good');
  assert.equal(kpi(report, 'utilization').value, '30%');
  assert.equal(kpi(report, 'utilization').status, 'bad');
  assert.equal(kpi(report, 'minutes_per_box').value, '18m');
  assert.equal(kpi(report, 'capacity_left').value, '6h 47m');
  assert.equal(kpi(report, 'capacity_left').status, 'neutral');
  assert.equal(report.kpis.length, 8);
  for (const k of report.kpis) assert.ok(k.definition.length > 10, `${k.id} needs a definition`);

  // The unpaired completion prints no handle and no wait, and falls back to the
  // scan ref for identity rather than an empty cell.
  const items = report.sections[1];
  assert.equal(items.title, 'Item number to time');
  const unpaired = items.rows.find((r) => r.packed_at === '12:00');
  assert.ok(unpaired);
  assert.equal(unpaired.handle, '—');
  assert.equal(unpaired.wait, '—');
  assert.equal(unpaired.item_number, 'TRK-777');
  assert.match(report.notes[1], /1 of 4 boxes/);

  // Item rows are newest first, the break is labeled, and a null item number
  // falls back to the SKU.
  assert.deepEqual(
    items.rows.map((r) => r.packed_at),
    ['12:00', '11:30', '09:20', '09:00'],
  );
  assert.equal(items.rows[1].wait, 'break 2h');
  assert.equal(items.rows[2].item_number, 'SKU-MED');
  assert.equal(String(items.rows[1].product).length <= 60, true);

  // Tier mix: small ran 6m against 10m earned → -4m variance.
  const tiers = report.sections[2];
  assert.deepEqual(tiers.rows[0], {
    tier: 'Small',
    boxes: '2',
    standard_each: '5m',
    earned: '10m',
    actual: '6m',
    variance: '-4m',
  });
  assert.equal(tiers.rows[2].variance, '-5m'); // big: 55m actual vs 60m earned

  // Standards print the pack tiers, the workday and the break threshold.
  const labels = report.standards.map((s) => s.label);
  assert.deepEqual(labels, ['Small item', 'Medium item', 'Big item', 'Workday', 'Break threshold']);
  assert.equal(report.standards[4].value, String(BREAK_THRESHOLD_MINUTES));
  assert.equal(report.standards[3].value, '480');
  assert.ok(report.followUps.length >= 2);
  assert.match(envelope.summary, /Jane Packer completed 4 boxes/);
});

test('whole floor: per-packer totals row equals the column sums', async () => {
  const bob = completion({
    sal_id: 9,
    staff_id: 8,
    packer: 'Bob Packer',
    completed_at: `${DAY}T10:00:00`,
    completed_hm: '10:00',
    pack_tier: 'MEDIUM',
    standard_minutes: '15',
    handle_minutes: '20',
    wait_minutes: null,
    attended_minutes: '60',
  });
  const { query, cap } = fakeQuery({
    capacity: [{ packer_headcount: 2, workday_minutes: 480, daily_medium_target: 60, daily_large_target: 16 }],
    completions: [...JANE_ROWS, bob],
  });

  const envelope = await buildPackingPerformanceReport({}, CTX, { query }, NOW);
  const report = reportOf(envelope);

  // No name asked → no staff lookup and no $3 filter.
  assert.equal(cap.sql.some((s) => s.includes('ILIKE')), false);
  assert.deepEqual(cap.params[cap.params.length - 1], [ORG, DAY]);
  assert.equal(report.question, "What is the pack floor's packing performance today?");
  assert.equal(report.scope, `Pack floor · ${DAY} (PT)`);

  const perPacker = report.sections[0];
  assert.equal(perPacker.title, 'Per packer');
  assert.deepEqual(
    perPacker.rows.map((r) => r.packer),
    ['Jane Packer', 'Bob Packer'],
  );
  const totals = perPacker.totals;
  assert.ok(totals);

  // Count columns: the footer is the arithmetic sum of the rows above it.
  for (const key of ['boxes', 'small', 'medium', 'large'] as const) {
    const sum = perPacker.rows.reduce((acc, r) => acc + Number(r[key]), 0);
    assert.equal(totals[key], String(sum), `${key} totals must equal the column sum`);
  }
  // Minute columns are pre-formatted, so they are pinned to the sums directly:
  // earned 85 + 15 = 100, handle 73 + 20 = 93, wait 2 + 0 = 2.
  assert.equal(totals.earned, '1h 40m');
  assert.equal(totals.handle, '1h 33m');
  assert.equal(totals.wait, '2m');
  assert.equal(totals.packer, '2 packers');
  assert.equal(totals.efficiency, '108%'); // 100/93
  assert.equal(totals.utilization, '31%'); // 93 / (240 + 60)
  assert.equal(totals.pct_of_day, '10%'); // 93 / (2 × 480)

  assert.equal(kpi(report, 'boxes').value, '5');
  assert.equal(kpi(report, 'capacity_left').value, '14h 27m'); // 960 - 93
  assert.match(kpi(report, 'capacity_left').definition, /headcount/);
  assert.match(report.notes[2], /rules 4 · sku_profile 1/);
  assert.match(report.notes[3], /PACK_COMPLETED/);
});

test('ambiguous name: lists the matches and refuses to guess a person', async () => {
  const { query } = fakeQuery({
    staff: [
      { id: 7, name: 'Jane Packer', role: 'packer' },
      { id: 12, name: 'Jane Ortega', role: 'lead' },
    ],
    completions: JANE_ROWS,
  });

  const envelope = await buildPackingPerformanceReport({ staffName: 'Jane' }, CTX, { query }, NOW);
  const report = reportOf(envelope);

  assert.equal(report.headline.value, '2');
  assert.equal(report.sections.length, 1);
  assert.equal(report.sections[0].title, 'Matches');
  assert.deepEqual(
    report.sections[0].rows.map((r) => r.staff),
    ['Jane Packer', 'Jane Ortega'],
  );
  assert.equal(report.kpis.length, 0);
  assert.match(report.notes[0], /Ask again with the full name/);
  assert.equal(report.followUps.length, 2);
  assert.match(envelope.summary, /matches 2 active staff/);
});

test('no match: an empty report naming the name that missed', async () => {
  const { query, cap } = fakeQuery({ staff: [], completions: JANE_ROWS });

  const envelope = await buildPackingPerformanceReport({ staffName: 'Zeke' }, CTX, { query }, NOW);
  const report = reportOf(envelope);

  // The completions query never runs when the person does not exist.
  assert.equal(cap.sql.length, 1);
  assert.equal(report.headline.value, '0');
  assert.match(report.notes[0], /No active staff match the name "Zeke"/);
  assert.equal(report.standards.length, 3);
  assert.match(envelope.summary, /Zeke/);
});

test('no completions: zero is a rendered report, not a blank panel', async () => {
  const { query } = fakeQuery({ capacity: [], completions: [] });

  const envelope = await buildPackingPerformanceReport({ dayPst: '2026-09-05' }, CTX, { query }, NOW);
  const report = reportOf(envelope);

  assert.equal(report.question, "What is the pack floor's packing performance on 2026-09-05?");
  assert.equal(report.headline.value, '0');
  // Capacity fell back to 2 packers × 480 minutes.
  assert.equal(report.standards[3].value, '480');
  assert.match(report.standards[3].note ?? '', /2 packer headcount/);
});
