/**
 * DB-free unit tests for the unbox-backlog report.
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/reports/unbox-backlog.test.ts
 *
 * The report's job is arithmetic an owner will act on: how many boxes, how old,
 * and how many are already half-open on the bench. All three are computed in
 * TypeScript over pre-grouped rows, so a fake `deps.query` plus a fixed clock
 * is enough to pin every boundary.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUnboxBacklogReport } from './unbox-backlog';
import {
  artifactReportSchema,
  sessionArtifactSchema,
  type ArtifactReport,
  type ArtifactReportSection,
} from '@/lib/assistant/ui-artifacts';
import type { ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type { AssistantToolCtx } from '@/lib/assistant/tools/types';

const ORG = '11111111-2222-3333-4444-555555555555';
const NOW = new Date('2026-09-06T18:30:00.000Z');

const CTX: AssistantToolCtx = {
  organizationId: ORG,
  staffId: 4,
  permissions: new Set(['receiving.view']),
};

type Row = Record<string, unknown>;

interface Call {
  orgId: string;
  sql: string;
  params: readonly unknown[];
}

interface Fixture {
  ages?: Row[];
  sources?: Row[];
  detail?: Row[];
}

/** DI seam: routes each statement by its shape, and records what was bound. */
function fakeDeps(fixture: Fixture, calls: Call[]) {
  return {
    query: async (orgId: string, sql: string, params?: ReadonlyArray<unknown>) => {
      calls.push({ orgId, sql, params: params ?? [] });
      if (sql.includes('GROUP BY b.age_days')) return { rows: fixture.ages ?? [] };
      if (sql.includes('GROUP BY b.source')) return { rows: fixture.sources ?? [] };
      if (sql.includes('ORDER BY b.age_days DESC')) return { rows: fixture.detail ?? [] };
      throw new Error(`unexpected statement: ${sql.slice(0, 80)}`);
    },
  };
}

/** Validate at the same boundary the loop does, and get a typed report back. */
function reportOf(env: ToolArtifactEnvelope): ArtifactReport {
  assert.equal(sessionArtifactSchema.safeParse(env.artifact).success, true);
  return artifactReportSchema.parse(env.artifact);
}

function sectionOf(report: ArtifactReport, title: string): ArtifactReportSection {
  const found = report.sections.find((s) => s.title === title);
  assert.ok(found, `missing section: ${title}`);
  return found;
}

/** One age row: `n` boxes at `ageDays`, ten expected units each. */
function ageRow(ageDays: number, extra: Row = {}): Row {
  return {
    age_days: ageDays,
    boxes: 1,
    units: 10,
    on_bench: 0,
    returns_ct: 0,
    priority_ct: 0,
    unfound_ct: 0,
    ...extra,
  };
}

test('every statement leads with organization_id = $1 and binds org from ctx, never input', async () => {
  const calls: Call[] = [];
  await buildUnboxBacklogReport(
    { source: 'zoho_po', returnsOnly: true },
    CTX,
    fakeDeps({ ages: [ageRow(0)] }, calls),
    NOW,
  );

  assert.equal(calls.length, 3, 'ages + sources + detail');
  for (const call of calls) {
    assert.match(call.sql, /r\.organization_id = \$1/);
    assert.equal(call.orgId, ORG);
    assert.equal(call.params[0], ORG);
    // The two filters are bound, not interpolated.
    assert.equal(call.params[1], 'zoho_po');
    assert.equal(call.params[2], true);
    assert.doesNotMatch(call.sql, /'zoho_po'/);
  }
});

test('the backlog predicate is the bench predicate: arrived, and unboxed_at still NULL', async () => {
  const calls: Call[] = [];
  await buildUnboxBacklogReport({}, CTX, fakeDeps({ ages: [ageRow(0)] }, calls), NOW);

  const sql = calls[0].sql;
  assert.match(sql, /ru\.unboxed_at IS NULL/);
  assert.match(sql, /rt\.door_received_at IS NOT NULL/);
  assert.match(sql, /FROM receiving_scans rs/);
  assert.match(sql, /FROM receiving_carton r/);
  assert.match(sql, /SUM\(rl\.quantity_expected\)/);
});

test('age buckets: 0 is Today, 1 is its own band, and 2-3 / 4-7 / 8+ are inclusive', async () => {
  const report = reportOf(
    await buildUnboxBacklogReport(
      {},
      CTX,
      fakeDeps({ ages: [0, 1, 2, 3, 4, 7, 8].map((d) => ageRow(d)) }, []),
      NOW,
    ),
  );

  const section = sectionOf(report, 'Age of the backlog');
  assert.deepEqual(
    section.rows.map((r) => [r.bucket, r.boxes, r.units, r.oldest]),
    [
      ['Today', '1', '10', '0 days'],
      ['1 day', '1', '10', '1 day'],
      ['2-3 days', '2', '20', '3 days'],
      ['4-7 days', '2', '20', '7 days'],
      ['8+ days', '1', '10', '8 days'],
    ],
  );
  assert.deepEqual(section.totals, {
    bucket: 'Total',
    boxes: '7',
    units: '70',
    oldest: '8 days',
  });
  assert.equal(report.headline.value, '7');
  assert.equal(report.headline.unit, 'boxes');
});

test('an age band with nothing in it prints an em dash, not a zero-day age', async () => {
  const report = reportOf(
    await buildUnboxBacklogReport({}, CTX, fakeDeps({ ages: [ageRow(1)] }, []), NOW),
  );
  const rows = sectionOf(report, 'Age of the backlog').rows;
  assert.equal(rows[0].oldest, '—', 'Today is empty');
  assert.equal(rows[1].oldest, '1 day');
  assert.equal(rows[4].oldest, '—', '8+ is empty');
});

test('oldest_days verdict follows the declared 2 / 5 day standard', async () => {
  const verdictAt = async (age: number) => {
    const report = reportOf(
      await buildUnboxBacklogReport({}, CTX, fakeDeps({ ages: [ageRow(age)] }, []), NOW),
    );
    return report.kpis.find((k) => k.id === 'oldest_days')?.status;
  };
  assert.equal(await verdictAt(2), 'good');
  assert.equal(await verdictAt(5), 'watch');
  assert.equal(await verdictAt(6), 'bad');
});

test('on_bench is the half-done pile: 0 good, 3 watch, 4 bad — and it sums across ages', async () => {
  const bench = async (perAge: number[]) => {
    const report = reportOf(
      await buildUnboxBacklogReport(
        {},
        CTX,
        fakeDeps(
          { ages: perAge.map((n, i) => ageRow(i, { boxes: Math.max(1, n), on_bench: n })) },
          [],
        ),
        NOW,
      ),
    );
    const kpi = report.kpis.find((k) => k.id === 'on_bench');
    assert.ok(kpi);
    return kpi;
  };

  const none = await bench([0]);
  assert.equal(none.value, '0');
  assert.equal(none.status, 'good');

  const three = await bench([2, 1]);
  assert.equal(three.value, '3', 'benched boxes sum across age rows');
  assert.equal(three.status, 'watch');

  const four = await bench([2, 2]);
  assert.equal(four.value, '4');
  assert.equal(four.status, 'bad');
  assert.match(four.definition, /opened_at/);
});

test('an empty backlog is a rendered zero, with the never-scanned blind spot still on it', async () => {
  const calls: Call[] = [];
  const env = await buildUnboxBacklogReport({}, CTX, fakeDeps({ ages: [] }, calls), NOW);
  const report = reportOf(env);

  assert.equal(calls.length, 1, 'no point querying sources or detail for an empty pile');
  assert.equal(report.kind, 'report');
  assert.equal(report.headline.value, '0');
  assert.equal(report.headline.unit, 'boxes');
  assert.equal(report.question, 'How many boxes are left to be unboxed?');
  assert.ok(report.standards.length > 0, 'the standards still declare the predicate');
  assert.ok(
    report.notes.some((n) => n.includes('delivered-unscanned')),
    'zero is exactly when the never-scanned queue matters',
  );
  assert.equal(report.followUps.length, 2);
  assert.match(env.summary, /Nothing is waiting to be unboxed/);
});

test('detail rows are pre-formatted: box id, PT arrival date, flags joined, em dash when bare', async () => {
  const report = reportOf(
    await buildUnboxBacklogReport(
      {},
      CTX,
      fakeDeps(
        {
          ages: [ageRow(6, { on_bench: 1, returns_ct: 1, unfound_ct: 1, priority_ct: 1 })],
          sources: [
            {
              source: 'zoho_po',
              boxes: 1,
              units: 10,
              returns_ct: 1,
              unfound_ct: 1,
              oldest_days: 6,
            },
          ],
          detail: [
            {
              carton_id: 812,
              age_days: 6,
              arrived_at: '2026-08-31T15:00:00.000Z',
              po_number: 'PO-4412',
              lines_ct: 3,
              units_ct: 10,
              is_return: true,
              is_priority: true,
              pairing_state: 'UNFOUND',
              opened_at: '2026-09-05T20:00:00.000Z',
            },
            {
              carton_id: 813,
              age_days: 6,
              arrived_at: null,
              po_number: null,
              lines_ct: 0,
              units_ct: 0,
              is_return: false,
              is_priority: false,
              pairing_state: 'MATCHED',
              opened_at: null,
            },
          ],
        },
        [],
      ),
      NOW,
    ),
  );

  const detail = sectionOf(report, 'Oldest boxes first');
  assert.deepEqual(detail.rows[0], {
    age: '6 days',
    arrived: 'Aug 31, 2026',
    box: '#812',
    po: 'PO-4412',
    lines: '3',
    units: '10',
    flags: 'Return · Priority · Unfound · On bench',
  });
  assert.deepEqual(detail.rows[1], {
    age: '6 days',
    arrived: '—',
    box: '#813',
    po: '—',
    lines: '0',
    units: '0',
    flags: '—',
  });

  // Section rows may only use keys the columns declare.
  for (const section of report.sections) {
    const keys = new Set(section.columns.map((c) => c.key));
    for (const row of section.rows) {
      for (const key of Object.keys(row)) assert.ok(keys.has(key), `stray key ${key}`);
    }
  }
});

test('every KPI carries an auditable definition, and the report fits the contract caps', async () => {
  const report = reportOf(
    await buildUnboxBacklogReport(
      {},
      CTX,
      fakeDeps({ ages: [ageRow(3, { unfound_ct: 1 })] }, []),
      NOW,
    ),
  );
  assert.ok(report.kpis.length > 0);
  for (const kpi of report.kpis) assert.ok(kpi.definition.length > 20, kpi.id);
  assert.ok(report.sections.length <= 4);
  assert.ok(report.kpis.length <= 8);
  assert.ok(report.standards.length <= 8);
  assert.match(report.asOf, /PT$/);
});
