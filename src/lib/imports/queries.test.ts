import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_ROW_OUTCOMES } from './types';
import { parseImportParams } from './params';
import {
  IMPORT_TOTAL_OUTCOMES,
  buildImportRowsListSql,
  getImportRunDetail,
  listImportRows,
  listImportRuns,
  type ImportQueryDeps,
} from './queries';

const ORG = '00000000-0000-0000-0000-000000000001';
const TODAY = '2026-09-28';

test('every outcome but `unchanged` lands in exactly one run total', () => {
  const owners = new Map<string, string[]>();
  for (const [total, outcomes] of Object.entries(IMPORT_TOTAL_OUTCOMES)) {
    for (const outcome of outcomes) owners.set(outcome, [...(owners.get(outcome) ?? []), total]);
  }
  for (const outcome of IMPORT_ROW_OUTCOMES) {
    if (outcome === 'unchanged') assert.equal(owners.get(outcome), undefined, 'unchanged must never be counted');
    else assert.equal(owners.get(outcome)?.length, 1, `${outcome} → ${owners.get(outcome)}`);
  }
});

/** A run row as Postgres returns it (BIGINTs as strings, a Date, text[] as a literal). */
const RUN_ROW = {
  id: '41',
  kind: 'pipeline',
  trigger: 'manual',
  triggered_by_staff_id: 7,
  staff_name: 'Ana',
  status: 'partial',
  started_at: new Date('2026-09-28T16:00:00.000Z'),
  finished_at: new Date('2026-09-28T16:01:30.000Z'),
  duration_ms: 90000,
  error: 'square: timeout',
  cron_run_id: '900',
  sources: '{shipstation,google_sheets}',
  total_inserted: 3,
  total_backfilled: 2,
  total_tracking_filled: 1,
  total_needs_review: 4,
  total_skipped: 5,
  total_failed: 0,
};

function deps(byTable: (sql: string) => Array<Record<string, unknown>>): ImportQueryDeps & { sqls: string[] } {
  const sqls: string[] = [];
  return {
    sqls,
    run: async (orgId, sql) => {
      assert.equal(orgId, ORG);
      sqls.push(sql);
      return byTable(sql);
    },
  };
}

test('the runs list and the run record read the same totals, with the staffer who ran it', async () => {
  const d = deps((sql) => {
    if (/COUNT\(\*\)::int AS n/.test(sql) && !/LATERAL/.test(sql)) return [{ n: 1 }];
    if (/FROM order_import_run_steps s\s+WHERE s\.organization_id = \$1/.test(sql)) {
      return [{ id: '5', step: 'shipstation', ok: true, counts: { imported: 2, updated: '1' }, error: null, started_at: null, finished_at: null }];
    }
    return [RUN_ROW];
  });
  const page = await listImportRuns(ORG, parseImportParams('runs', new URLSearchParams(), TODAY), d);
  const detail = await getImportRunDetail(ORG, 41, d);
  assert.equal(page.total, 1);
  assert.deepEqual(page.items[0], {
    id: 41,
    kind: 'pipeline',
    trigger: 'manual',
    triggeredBy: { staffId: 7, name: 'Ana' },
    status: 'partial',
    startedAt: '2026-09-28T16:00:00.000Z',
    finishedAt: '2026-09-28T16:01:30.000Z',
    durationMs: 90000,
    sources: ['shipstation', 'google_sheets'],
    totals: { inserted: 3, backfilled: 2, trackingFilled: 1, needsReview: 4, skipped: 5, failed: 0 },
    error: 'square: timeout',
    cronRunId: 900,
  });
  assert.ok(detail);
  const { steps, ...head } = detail;
  assert.deepEqual(head, page.items[0]);
  assert.deepEqual(steps, [
    {
      id: 5,
      step: 'shipstation',
      ok: true,
      counts: { imported: 2, updated: 1, trackingFilled: 0, ambiguous: 0, skipped: 0, failed: 0 },
      error: null,
      startedAt: null,
      finishedAt: null,
    },
  ]);
});

test('a run id outside the org (no row) is null — the route answers 404', async () => {
  const d = deps(() => []);
  assert.equal(await getImportRunDetail(ORG, 999, d), null);
  assert.ok(d.sqls.every((sql) => /organization_id = \$1/.test(sql)));
});

test('rows read the title through the SKU identity ladder: catalog, then the order’s own, then the SKU', async () => {
  const base = {
    id: '1', run_id: '41', step_id: null, order_row_id: 88, external_order_id: '12-345', account_source: 'Main',
    platform: 'ebay', source: 'google_sheets', outcome: 'inserted', reason: null, filled_fields: ['sku', 'ship_by'],
    tracking_number: null, shipment_id: null, sku_catalog_id: 3, item_number: 'IT-1', shipstation_order_id: null,
    shipstation_shipment_id: '77', sheet_tab: 'Sheet_09_28_2026', sheet_row: 14, import_exception_id: null,
    created_at: '2026-09-28T16:00:00Z',
  };
  const d = deps((sql) =>
    /COUNT\(\*\)::int AS n/.test(sql)
      ? [{ n: '3' }]
      : [
          { ...base, catalog_product_title: 'Bose QC45', item_name: 'bose qc 45 LISTING', sku: 'BQ45' },
          { ...base, id: '2', catalog_product_title: null, item_name: 'bose qc 45 LISTING', sku: 'BQ45' },
          { ...base, id: '3', order_row_id: null, catalog_product_title: null, item_name: null, sku: null },
        ],
  );
  const page = await listImportRows(ORG, parseImportParams('rows', new URLSearchParams(), TODAY), d);
  assert.equal(page.total, 3);
  assert.deepEqual(page.items.map((r) => r.title), ['Bose QC45', 'bose qc 45 LISTING', null]);
  assert.deepEqual(page.items[0].filledFields, ['sku', 'ship_by']);
  assert.equal(page.items[0].shipstationShipmentId, 77);
  assert.equal(page.items[2].orderRowId, null);
});

test('paging binds limit/offset after the filters; the count statement shares the filters, not the page', () => {
  const filters = parseImportParams('rows', new URLSearchParams('page=3&pageSize=20&outcome=failed'), TODAY);
  const q = buildImportRowsListSql(ORG, filters);
  assert.deepEqual(q.params.slice(-2), [20, 40]);
  assert.deepEqual(q.countParams, q.params.slice(0, -2));
  assert.doesNotMatch(q.countSql, /LIMIT/);
});
