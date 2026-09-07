/**
 * DB-free unit tests for the ROI rank report.
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/reports/roi-rank.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionArtifactSchema } from '@/lib/assistant/ui-artifacts';
import type { AssistantToolCtx, AssistantToolQueryResult } from '@/lib/assistant/tools/types';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  ageWeight,
  buildRoiRankReport,
  MINUTES_TO_CLEAR_PER_UNIT,
  rankGaps,
  type RoiGapRow,
} from './roi-rank';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;
const CTX: AssistantToolCtx = { organizationId: ORG, staffId: 7, permissions: new Set(['operations.view']) };
const NOW = new Date('2026-09-06T18:00:00Z');

function gap(id: string, units: number, oldestDays: number | null): RoiGapRow {
  return { id, label: `Gap ${id}`, units, unit: 'units', oldestDays, why: 'because', question: `Show me ${id}` };
}

/**
 * Fake `deps.query`: the six gap counts are matched off the table each query
 * hits, so the fake never depends on the order the builder runs them in.
 */
function fakeQuery(
  counts: Readonly<Record<string, { units: number; oldest: number | null }>>,
  opts: { workdayMinutes?: number | null } = {},
) {
  const seen: Array<{ orgId: string; text: string; params: ReadonlyArray<unknown> }> = [];
  const query = async (
    orgId: OrgId,
    text: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<AssistantToolQueryResult> => {
    seen.push({ orgId, text, params: params ?? [] });
    if (text.includes('org_pack_capacity')) {
      return {
        rows: opts.workdayMinutes == null ? [] : [{ workday_minutes: opts.workdayMinutes }],
      };
    }
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
              : text.includes('unit_repairs')
                ? 'repairs_in_flight'
                : 'unknown';
    const hit = counts[id];
    if (!hit) return { rows: [{ units: 0, oldest_days: null }] };
    return { rows: [{ units: hit.units, oldest_days: hit.oldest }] };
  };
  return { query, seen };
}

test('ageWeight is 1.0 / 2.0 / 3.0 at 0, 30, 60 days and stays capped past 60', () => {
  assert.equal(ageWeight(0), 1);
  assert.equal(ageWeight(30), 2);
  assert.equal(ageWeight(60), 3);
  assert.equal(ageWeight(90), 3);
  assert.equal(ageWeight(365), 3);
  // A table with no date claims no decay rather than guessing one.
  assert.equal(ageWeight(null), 1);
  assert.equal(ageWeight(15), 1.5);
});

test('effort is units × the declared minutes-per-unit standard for the gap', () => {
  const ranked = rankGaps([gap('repairs_in_flight', 4, 0), gap('unlisted_units', 10, 0)]);
  const repairs = ranked.find((r) => r.id === 'repairs_in_flight');
  const unlisted = ranked.find((r) => r.id === 'unlisted_units');
  assert.equal(MINUTES_TO_CLEAR_PER_UNIT.repairs_in_flight, 45);
  assert.equal(repairs?.effortMinutes, 4 * 45);
  assert.equal(unlisted?.effortMinutes, 10 * 6);
});

test('a gap with units = 0 is dropped, not rendered as an empty row', () => {
  const ranked = rankGaps([gap('units_on_hold', 0, 200), gap('dead_stock', 3, 0)]);
  assert.deepEqual(ranked.map((r) => r.id), ['dead_stock']);
});

test('an old small gap outranks a fresh big one — priority = units × ageWeight', () => {
  // 5 × 3.0 = 15 beats 12 × 1.0 = 12, which a raw count ranking would invert.
  const ranked = rankGaps([gap('units_on_hold', 12, 0), gap('unlisted_units', 5, 60)]);
  assert.equal(ranked[0]?.id, 'unlisted_units');
  assert.equal(ranked[0]?.priority, 15);
  assert.equal(ranked[1]?.priority, 12);
});

test('report: headline names the top gap, person-days use the org workday standard', async () => {
  const { query, seen } = fakeQuery(
    { unlisted_units: { units: 100, oldest: 30 }, dead_stock: { units: 2, oldest: 100 } },
    { workdayMinutes: 600 },
  );
  const out = await buildRoiRankReport({ limit: 6 }, CTX, { query }, NOW);
  const report = out.artifact;
  assert.equal(report.kind, 'report');
  if (report.kind !== 'report') return;

  assert.equal(report.headline.label, 'Biggest gap: Received but never listed');
  assert.equal(report.headline.value, '100');
  assert.match(report.headline.hint ?? '', /oldest 30 days/);

  // 100 × 6 min = 600 min unlisted, 2 × 15 = 30 min dead stock ⇒ 630 total.
  // 630 / 600-minute workday = 1.05 person-days.
  const personDays = report.kpis.find((k) => k.id === 'person_days');
  assert.equal(personDays?.value, '1.1');
  assert.match(personDays?.definition ?? '', /600-minute workday/);
  assert.equal(report.kpis.find((k) => k.id === 'total_effort')?.value, '10h 30m');

  // Every KPI carries an auditable definition, and the formula is printed.
  for (const kpi of report.kpis) assert.ok(kpi.definition.length > 10, `${kpi.id} needs a definition`);
  assert.ok(report.standards.some((s) => /ageWeight = 1 \+ min\(oldestDays, 60\) \/ 30/.test(s.note ?? '')));
  assert.ok(report.standards.some((s) => s.label === 'Workday' && s.value === '600'));

  // The ranking columns the owner re-ranks by eye must all be present.
  const rank = report.sections[0]!;
  assert.equal(rank.title, 'Gaps ranked by priority');
  assert.deepEqual(rank.columns.map((c) => c.key), [
    'rank', 'gap', 'units', 'unit', 'oldest_days', 'age_weight', 'priority', 'effort', 'payback', 'why',
  ]);
  for (const row of [...rank.rows, ...report.sections[1]!.rows]) {
    // Renderer does zero math: every cell is pre-formatted and keyed by a column.
    assert.ok(Object.keys(row).length > 0);
  }
  for (const section of report.sections) {
    const keys = new Set(section.columns.map((c) => c.key));
    for (const row of section.rows) {
      for (const key of Object.keys(row)) assert.ok(keys.has(key), `${section.title}: stray key ${key}`);
    }
    if (section.totals) {
      for (const key of Object.keys(section.totals)) assert.ok(keys.has(key), `${section.title}: stray total ${key}`);
    }
  }

  // No dollar figure anywhere, and the report says so out loud.
  assert.ok(report.notes.some((n) => /NO dollar figure/.test(n)));
  assert.ok(!/\$\d/.test(JSON.stringify(report)));

  // Follow-ups are the per-gap drill-downs, plain sentences only.
  assert.equal(report.followUps.length, 2);
  assert.equal(report.followUps[0]?.question, 'Show me the units that were received but never listed, oldest first');

  assert.ok(sessionArtifactSchema.safeParse(report).success);
  assert.match(out.summary, /Received but never listed/);

  // Tenancy: every statement got the ctx org as $1 and nothing else.
  assert.ok(seen.length >= 7);
  for (const call of seen) {
    assert.equal(call.orgId, ORG);
    assert.equal(call.params[0], ORG);
    assert.match(call.text, /organization_id = \$1/);
  }
});

test('report: workday falls back to the 480-minute default when org_pack_capacity is empty', async () => {
  const { query } = fakeQuery({ unlisted_units: { units: 80, oldest: 0 } }, { workdayMinutes: null });
  const out = await buildRoiRankReport({}, CTX, { query }, NOW);
  if (out.artifact.kind !== 'report') throw new Error('expected report');
  // 80 × 6 = 480 min = exactly one 480-minute person-day.
  assert.equal(out.artifact.kpis.find((k) => k.id === 'person_days')?.value, '1.0');
  assert.ok(out.artifact.standards.some((s) => s.label === 'Workday' && s.value === '480'));
});

test('report: all six gaps empty renders a zero report, not a blank panel', async () => {
  const { query } = fakeQuery({});
  const out = await buildRoiRankReport({}, CTX, { query }, NOW);
  const report = out.artifact;
  if (report.kind !== 'report') throw new Error('expected report');
  assert.equal(report.headline.value, '0');
  assert.equal(report.sections.length, 0);
  assert.equal(report.notes.length, 1);
  assert.match(out.summary, /Nothing is stuck/);
  assert.ok(sessionArtifactSchema.safeParse(report).success);
});

test('report: limit caps the rendered rows but totals still count every open gap', async () => {
  const { query } = fakeQuery({
    unlisted_units: { units: 10, oldest: 0 },
    dead_stock: { units: 9, oldest: 0 },
    open_order_exceptions: { units: 8, oldest: 0 },
  });
  const out = await buildRoiRankReport({ limit: 1 }, CTX, { query }, NOW);
  if (out.artifact.kind !== 'report') throw new Error('expected report');
  assert.equal(out.artifact.sections[0]?.rows.length, 1);
  assert.equal(out.artifact.kpis.find((k) => k.id === 'gaps_open')?.value, '3');
  assert.equal(out.artifact.kpis.find((k) => k.id === 'total_stuck')?.value, '27');
  assert.equal(out.artifact.followUps.length, 3);
});
