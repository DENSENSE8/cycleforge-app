/**
 * DB-free unit tests for the order-value report.
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/reports/order-value-rank.test.ts
 *
 * Two things must never drift here: the definition of "still in the warehouse"
 * (four clauses, all in the SQL) and the fact that money arrives from node-pg
 * as a STRING and must still print as money.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderValueRankReport } from './order-value-rank';
import {
  artifactReportSchema,
  sessionArtifactSchema,
  type ArtifactReport,
  type ArtifactReportSection,
} from '@/lib/assistant/ui-artifacts';
import type { ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type { AssistantToolCtx } from '@/lib/assistant/tools/types';

const ORG = '99999999-8888-7777-6666-555555555555';
const NOW = new Date('2026-09-06T18:30:00.000Z');

const CTX: AssistantToolCtx = {
  organizationId: ORG,
  staffId: 11,
  permissions: new Set(['dashboard.view']),
};

type Row = Record<string, unknown>;

interface Call {
  orgId: string;
  sql: string;
  params: readonly unknown[];
}

interface Fixture {
  stages?: Row[];
  top?: Row[];
  lines?: Row[];
}

/** DI seam: routes each statement by its shape, and records what was bound. */
function fakeDeps(fixture: Fixture, calls: Call[]) {
  return {
    query: async (orgId: string, sql: string, params?: ReadonlyArray<unknown>) => {
      calls.push({ orgId, sql, params: params ?? [] });
      if (sql.includes('GROUP BY s.stage')) return { rows: fixture.stages ?? [] };
      if (sql.includes('ORDER BY s.value DESC')) return { rows: fixture.top ?? [] };
      if (sql.includes('WHERE ib.order_key = $2')) return { rows: fixture.lines ?? [] };
      throw new Error(`unexpected statement: ${sql.slice(0, 80)}`);
    },
  };
}

function reportOf(env: ToolArtifactEnvelope): ArtifactReport {
  assert.equal(sessionArtifactSchema.safeParse(env.artifact).success, true);
  return artifactReportSchema.parse(env.artifact);
}

function sectionOf(report: ArtifactReport, title: string): ArtifactReportSection {
  const found = report.sections.find((s) => s.title === title);
  assert.ok(found, `missing section: ${title}`);
  return found;
}

const STAGE_PACKED: Row = {
  stage: 'PACKED',
  stage_rank: 4,
  orders_ct: 2,
  value: '1999.00',
  oldest_days: 3,
  at_risk_value: '0',
  with_deadline: 0,
  currencies: 'USD',
};

const TOP_ONE: Row = {
  order_key: '11-12345-67890',
  order_id: '11-12345-67890',
  value: '1499.00',
  lines_ct: 3,
  stage: 'PACKED',
  age_days: 3,
  deadline_at: null,
  currency: 'USD',
  channel: 'ebay_main',
  tracking: '1Z999AA10123456784',
  carrier: 'UPS',
};

test('the four "still in the warehouse" clauses are in the SQL, org-scoped, stage bound not spliced', async () => {
  const calls: Call[] = [];
  await buildOrderValueRankReport(
    { limit: 5, stage: 'PENDING' },
    CTX,
    fakeDeps({ stages: [STAGE_PACKED], top: [TOP_ONE] }, calls),
    NOW,
  );

  assert.equal(calls.length, 3, 'stages + top + lines of the top order');
  for (const call of calls) {
    assert.match(call.sql, /o\.organization_id = \$1/);
    assert.equal(call.orgId, ORG);
    assert.equal(call.params[0], ORG);
    // 1. no dock scan-out
    assert.match(call.sql, /activity_type = 'SHIP_CONFIRM'/);
    assert.match(call.sql, /NOT EXISTS \(/);
    // 2. no carrier custody
    assert.match(call.sql, /stn\.is_carrier_accepted/);
    assert.match(call.sql, /'LABEL_CREATED', 'UNKNOWN'/);
    // 3. Amazon ships AFN
    assert.match(call.sql, /COALESCE\(o\.fulfillment_channel, ''\) <> 'AFN'/);
    // 4. caged placeholder without a catalog SKU is not stock
    assert.match(call.sql, /'caged' AND o\.sku_catalog_id IS NULL/);
  }

  // Stage facet + display cap arrive as parameters.
  assert.deepEqual(calls[0].params, [ORG, 'PENDING']);
  assert.deepEqual(calls[1].params, [ORG, 'PENDING', 5]);
  assert.deepEqual(calls[2].params, [ORG, '11-12345-67890']);
});

test('a hostile stage facet lands as a parameter, never in the statement text', async () => {
  const calls: Call[] = [];
  await buildOrderValueRankReport(
    { stage: "PACKED'; DROP TABLE orders --" },
    CTX,
    fakeDeps({ stages: [], top: [] }, calls),
    NOW,
  );
  for (const call of calls) {
    assert.doesNotMatch(call.sql, /DROP TABLE/);
    assert.match(call.sql, /\(\$2::text IS NULL OR s\.stage = \$2::text\)/);
  }
  assert.equal(calls[0].params[1], "PACKED'; DROP TABLE orders --");
});

test('value is SUM(sale_amount) grouped per order_id — line grain collapsed, never ranked raw', async () => {
  const calls: Call[] = [];
  await buildOrderValueRankReport(
    {},
    CTX,
    fakeDeps({ stages: [STAGE_PACKED], top: [TOP_ONE] }, calls),
    NOW,
  );

  const top = calls[1].sql;
  assert.match(top, /SUM\(ib\.sale_amount\)\s+AS value/);
  assert.match(top, /GROUP BY ib\.order_key/);
  assert.match(top, /COALESCE\(NULLIF\(o\.order_id, ''\), '#' \|\| o\.id::text\) AS order_key/);
  assert.match(top, /ORDER BY s\.value DESC/);
  // The order's stage is its least advanced line.
  assert.match(top, /MIN\(ib\.stage_rank\)/);
  assert.match(top, /THEN 'AWAITING_LABEL'/);
  // Ship-by comes from the TEST work assignment, not from orders.
  assert.match(top, /wa\.work_type = 'TEST'/);
});

test("a numeric(12,2) arriving as the string '1499.00' still prints as money", async () => {
  const report = reportOf(
    await buildOrderValueRankReport(
      { limit: 10 },
      CTX,
      fakeDeps(
        {
          stages: [STAGE_PACKED],
          top: [TOP_ONE],
          lines: [
            {
              sku: 'BOSE-901',
              product_title: 'Bose Lifestyle 650 Home Theater System With Omnijewel Speakers',
              quantity: '1',
              sale_amount: '1499.00',
              currency: 'USD',
            },
          ],
        },
        [],
      ),
      NOW,
    ),
  );

  assert.equal(report.headline.value, '$1,499');
  assert.equal(report.headline.label, 'Most expensive order in the building');
  assert.equal(report.headline.hint, '11-12345-67890 · PACKED · 3 days old');
  assert.equal(report.kpis.find((k) => k.id === 'top_order_value')?.value, '$1,499');

  const top = sectionOf(report, 'Top orders by value');
  assert.deepEqual(top.rows[0], {
    rank: 1,
    order: '11-12345-67890',
    value: '$1,499',
    lines: '3',
    stage: 'PACKED',
    age: '3 days',
    ship_by: '—',
    channel: 'ebay_main',
    tracking: '1Z999AA10123456784',
  });

  const lines = sectionOf(report, 'Lines in the top order');
  assert.deepEqual(lines.rows[0], {
    sku: 'BOSE-901',
    product: 'Bose Lifestyle 650 Home Theater System With Omnijewel Speake',
    qty: '1',
    value: '$1,499',
  });
});

test('value in the building sums the stage rows; the stage table totals match', async () => {
  const report = reportOf(
    await buildOrderValueRankReport(
      {},
      CTX,
      fakeDeps(
        {
          stages: [
            {
              stage: 'PENDING',
              stage_rank: 2,
              orders_ct: 3,
              value: '501.00',
              oldest_days: 9,
              at_risk_value: '0',
              with_deadline: 0,
              currencies: 'USD',
            },
            STAGE_PACKED,
          ],
          top: [TOP_ONE],
        },
        [],
      ),
      NOW,
    ),
  );

  assert.equal(report.kpis.find((k) => k.id === 'orders_in_building')?.value, '5');
  assert.equal(report.kpis.find((k) => k.id === 'value_in_building')?.value, '$2,500');

  const stages = sectionOf(report, 'Value by stage');
  assert.deepEqual(stages.rows, [
    { stage: 'PENDING', orders: '3', value: '$501.00', oldest_days: '9 days' },
    { stage: 'PACKED', orders: '2', value: '$1,999', oldest_days: '3 days' },
  ]);
  assert.deepEqual(stages.totals, {
    stage: 'Total',
    orders: '5',
    value: '$2,500',
    oldest_days: '9 days',
  });
});

test('past ship-by: any dollar past due reads bad; no deadlines at all reads neutral', async () => {
  const noDeadlines = reportOf(
    await buildOrderValueRankReport(
      {},
      CTX,
      fakeDeps({ stages: [STAGE_PACKED], top: [TOP_ONE] }, []),
      NOW,
    ),
  );
  const neutral = noDeadlines.kpis.find((k) => k.id === 'at_risk_value');
  assert.equal(neutral?.status, 'neutral');
  assert.match(neutral?.definition ?? '', /ORDER\/TEST work-assignment deadline/i);
  assert.ok(
    noDeadlines.notes.some((n) => n.includes('no ship-by to be past')),
    'absent deadline data is stated, not painted green',
  );

  const pastDue = reportOf(
    await buildOrderValueRankReport(
      {},
      CTX,
      fakeDeps(
        {
          stages: [{ ...STAGE_PACKED, at_risk_value: '1499.00', with_deadline: 2 }],
          top: [{ ...TOP_ONE, deadline_at: '2026-09-01T17:00:00.000Z' }],
        },
        [],
      ),
      NOW,
    ),
  );
  const bad = pastDue.kpis.find((k) => k.id === 'at_risk_value');
  assert.equal(bad?.value, '$1,499');
  assert.equal(bad?.status, 'bad');
  assert.equal(sectionOf(pastDue, 'Top orders by value').rows[0].ship_by, 'Sep 1, 2026 · past due');
});

test('mixed currencies are declared, never silently added as if converted', async () => {
  const report = reportOf(
    await buildOrderValueRankReport(
      {},
      CTX,
      fakeDeps(
        {
          stages: [{ ...STAGE_PACKED, currencies: 'CAD,USD' }],
          top: [TOP_ONE],
        },
        [],
      ),
      NOW,
    ),
  );
  assert.ok(
    report.notes.some((n) => n.includes('More than one currency')),
    'a mixed-currency total must say so',
  );

  const single = reportOf(
    await buildOrderValueRankReport(
      {},
      CTX,
      fakeDeps({ stages: [STAGE_PACKED], top: [TOP_ONE] }, []),
      NOW,
    ),
  );
  assert.equal(
    single.notes.some((n) => n.includes('More than one currency')),
    false,
  );
});

test('nothing in the building is a rendered zero, not an empty artifact or a shrug', async () => {
  const calls: Call[] = [];
  const env = await buildOrderValueRankReport({}, CTX, fakeDeps({ stages: [], top: [] }, calls), NOW);
  const report = reportOf(env);

  assert.equal(calls.length, 2, 'no top order means no line query');
  assert.equal(report.kind, 'report');
  assert.equal(report.headline.value, '0');
  assert.equal(report.question, 'What is the most expensive order currently in the warehouse?');
  assert.equal(report.standards.length, 4, 'the four clauses stay declared');
  assert.match(env.summary, /No orders are currently in the building/);
});

test('sale price, not margin — the report says so, and every KPI is auditable', async () => {
  const report = reportOf(
    await buildOrderValueRankReport(
      {},
      CTX,
      fakeDeps({ stages: [STAGE_PACKED], top: [TOP_ONE] }, []),
      NOW,
    ),
  );

  assert.ok(
    report.notes.some((n) => /not profit/i.test(n) && /no cost, fee or margin column/i.test(n)),
    'an owner reading "most expensive" must not read it as "most profitable"',
  );
  assert.ok(report.notes.some((n) => n.includes('AFN')));
  assert.ok(report.notes.some((n) => n.includes('work_assignments.deadline_at')));
  for (const kpi of report.kpis) assert.ok(kpi.definition.length > 20, kpi.id);
  assert.ok(report.kpis.length <= 8);
  assert.ok(report.sections.length <= 4);
  assert.equal(report.followUps[0].question, 'Show me the full history of order 11-12345-67890');

  for (const section of report.sections) {
    const keys = new Set(section.columns.map((c) => c.key));
    for (const row of section.rows) {
      for (const key of Object.keys(row)) assert.ok(keys.has(key), `stray key ${key}`);
    }
  }
});
