/**
 * Import record — the read side (`/operations/imports`, `/m/imports`).
 *
 * Every statement is tenant-scoped twice over: it runs through `tenantQuery`
 * (RLS) AND names `organization_id = $1` on every table it reads. The WHERE
 * builders are pure and shared by the lists and the facet counts
 * (`src/lib/nav/facets/imports.ts`), so a facet count is by construction the
 * list total for that pick.
 *
 * Totals are counted from the run's ROWS by outcome ({@link IMPORT_TOTAL_OUTCOMES}),
 * one fragment for the list and the record, so the two always agree; a
 * step's own counts are `order_import_run_steps.counts` (what the step
 * reported). `unchanged` rows count in nothing.
 */

import { resolveSkuIdentityTitle, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ImportFilters } from '@/lib/imports/params';
import type {
  ImportPage,
  ImportRowOutcome,
  ImportRunDetail,
  ImportRunKind,
  ImportRunListItem,
  ImportRunRowItem,
  ImportRunStatus,
  ImportRunStep,
  ImportRunTotals,
  ImportRunTrigger,
  ImportStepCounts,
} from '@/lib/imports/types';

export interface ImportQueryDeps {
  /** One tenant-scoped statement → rows. */
  run(orgId: OrgId, sql: string, params: readonly unknown[]): Promise<Array<Record<string, unknown>>>;
}

export const defaultImportQueryDeps: ImportQueryDeps = {
  run: async (orgId, sql, params) => (await tenantQuery(orgId, sql, params)).rows,
};

/** The step that parks refusals — a run's bookkeeping, never one of its sources. */
export const IMPORT_EXCEPTIONS_STEP = 'exceptions';

/** Which row outcomes each run total counts (the contract's read-side mapping). */
export const IMPORT_TOTAL_OUTCOMES: Readonly<Record<keyof ImportRunTotals, readonly ImportRowOutcome[]>> = {
  inserted: ['inserted'],
  backfilled: ['backfilled', 'adopted', 'claimed'],
  trackingFilled: ['tracking_filled'],
  needsReview: ['ambiguous', 'quarantined'],
  skipped: ['skipped'],
  failed: ['failed'],
};

const TOTAL_COLUMN: Readonly<Record<keyof ImportRunTotals, string>> = {
  inserted: 'total_inserted',
  backfilled: 'total_backfilled',
  trackingFilled: 'total_tracking_filled',
  needsReview: 'total_needs_review',
  skipped: 'total_skipped',
  failed: 'total_failed',
};

/** `COUNT(*) FILTER` per total over rows aliased `w` (outcomes are a fixed vocabulary). */
export function importTotalsSelectSql(): string {
  return (Object.keys(IMPORT_TOTAL_OUTCOMES) as Array<keyof ImportRunTotals>)
    .map((key) => {
      const list = IMPORT_TOTAL_OUTCOMES[key].map((o) => `'${o}'`).join(', ');
      return `COUNT(*) FILTER (WHERE w.outcome IN (${list}))::int AS ${TOTAL_COLUMN[key]}`;
    })
    .join(',\n           ');
}

// ── WHERE builders (pure) ───────────────────────────────────────────────────

/** Positional params with the org id pinned at `$1`. */
export class ImportSqlBinder {
  readonly params: unknown[];
  constructor(orgId: OrgId) {
    this.params = [orgId];
  }
  bind(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }
}

function likeOf(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Facet groups a WHERE may leave out so the facet query can count each option. */
export interface ImportWhereOptions {
  /** Drop the facet predicates (runs: status · source; rows: source · platform · account · outcome). */
  omitFacets?: boolean;
}

/**
 * Runs (`order_import_runs r`): window on `started_at`, trigger, status, who
 * ran it, the cron run, the source (a non-exceptions step), and Find (run id,
 * or a row's order number / tracking / sheet tab).
 */
export function buildImportRunsWhere(
  binder: ImportSqlBinder,
  filters: ImportFilters,
  options: ImportWhereOptions = {},
): string {
  const clauses = ['r.organization_id = $1'];
  if (filters.window) {
    clauses.push(`r.started_at >= ${binder.bind(filters.window.fromIso)}::timestamptz`);
    clauses.push(`r.started_at < ${binder.bind(filters.window.toIso)}::timestamptz`);
  }
  if (filters.trigger) clauses.push(`r.trigger = ${binder.bind(filters.trigger)}`);
  if (!options.omitFacets && filters.status) clauses.push(`r.status = ${binder.bind(filters.status)}`);
  if (filters.staffId != null) clauses.push(`r.triggered_by_staff_id = ${binder.bind(filters.staffId)}`);
  if (filters.cronRunId != null) clauses.push(`r.cron_run_id = ${binder.bind(filters.cronRunId)}`);
  if (!options.omitFacets && filters.sources.length > 0) {
    clauses.push(`EXISTS (SELECT 1 FROM order_import_run_steps s
                  WHERE s.organization_id = r.organization_id AND s.run_id = r.id
                    AND s.step <> '${IMPORT_EXCEPTIONS_STEP}' AND s.step = ANY(${binder.bind(filters.sources)}::text[]))`);
  }
  if (filters.q) {
    const like = binder.bind(likeOf(filters.q));
    const exact = binder.bind(filters.q);
    clauses.push(`(r.id::text = ${exact}
            OR EXISTS (SELECT 1 FROM order_import_run_rows w
                        WHERE w.organization_id = r.organization_id AND w.run_id = r.id
                          AND (w.external_order_id ILIKE ${like} OR w.tracking_number ILIKE ${like}
                               OR w.sheet_tab ILIKE ${like})))`);
  }
  return clauses.join('\n     AND ');
}

/**
 * Rows (`order_import_run_rows w` joined to its run `r`): window on the row's
 * `created_at`, the run's trigger, one run, the facets, and Find (order
 * number, tracking, sheet tab, run id).
 */
export function buildImportRowsWhere(
  binder: ImportSqlBinder,
  filters: ImportFilters,
  options: ImportWhereOptions = {},
): string {
  const clauses = ['w.organization_id = $1'];
  if (filters.window) {
    clauses.push(`w.created_at >= ${binder.bind(filters.window.fromIso)}::timestamptz`);
    clauses.push(`w.created_at < ${binder.bind(filters.window.toIso)}::timestamptz`);
  }
  if (filters.trigger) clauses.push(`r.trigger = ${binder.bind(filters.trigger)}`);
  if (filters.runId != null) clauses.push(`w.run_id = ${binder.bind(filters.runId)}`);
  if (!options.omitFacets) {
    const any = (column: string, values: readonly string[]) => {
      if (values.length > 0) clauses.push(`${column} = ANY(${binder.bind(values)}::text[])`);
    };
    any('w.source', filters.sources);
    any('w.platform', filters.platforms);
    any('w.account_source', filters.accounts);
    any('w.outcome', filters.outcomes);
  }
  if (filters.q) {
    const like = binder.bind(likeOf(filters.q));
    const exact = binder.bind(filters.q);
    clauses.push(`(w.external_order_id ILIKE ${like} OR w.tracking_number ILIKE ${like}
            OR w.sheet_tab ILIKE ${like} OR w.run_id::text = ${exact})`);
  }
  return clauses.join('\n     AND ');
}

/** Rows always read their run (trigger lives there); same org, by construction. */
export const IMPORT_ROWS_FROM_SQL = `order_import_run_rows w
  JOIN order_import_runs r ON r.id = w.run_id AND r.organization_id = w.organization_id`;

// ── runs ────────────────────────────────────────────────────────────────────

const RUN_SORT_SQL: Readonly<Record<string, string>> = {
  newest: 'r.started_at DESC, r.id DESC',
  inserted: `t.${TOTAL_COLUMN.inserted} DESC, r.started_at DESC, r.id DESC`,
  failed: `t.${TOTAL_COLUMN.failed} DESC, r.started_at DESC, r.id DESC`,
};

/** The run select — list and record share it, so their totals are one derivation. */
function runSelectSql(where: string): string {
  return `
    SELECT r.id::float8 AS id, r.kind, r.trigger, r.triggered_by_staff_id, st.name AS staff_name,
           r.status, r.started_at, r.finished_at, r.duration_ms, r.error,
           r.cron_run_id::float8 AS cron_run_id,
           COALESCE(sp.sources, ARRAY[]::text[]) AS sources,
           t.*
      FROM order_import_runs r
      LEFT JOIN staff st ON st.id = r.triggered_by_staff_id AND st.organization_id = r.organization_id
      LEFT JOIN LATERAL (
        SELECT array_agg(s.step ORDER BY s.started_at NULLS LAST, s.id) AS sources
          FROM order_import_run_steps s
         WHERE s.organization_id = r.organization_id AND s.run_id = r.id AND s.step <> '${IMPORT_EXCEPTIONS_STEP}'
      ) sp ON TRUE
      LEFT JOIN LATERAL (
        SELECT ${importTotalsSelectSql()}
          FROM order_import_run_rows w
         WHERE w.organization_id = r.organization_id AND w.run_id = r.id
      ) t ON TRUE
     WHERE ${where}`;
}

export function buildImportRunsListSql(orgId: OrgId, filters: ImportFilters) {
  const binder = new ImportSqlBinder(orgId);
  const where = buildImportRunsWhere(binder, filters);
  const countSql = `SELECT COUNT(*)::int AS n FROM order_import_runs r WHERE ${where}`;
  const countParams = [...binder.params];
  const limit = binder.bind(filters.pageSize);
  const offset = binder.bind((filters.page - 1) * filters.pageSize);
  const sql = `${runSelectSql(where)}
     ORDER BY ${RUN_SORT_SQL[filters.sort] ?? RUN_SORT_SQL.newest}
     LIMIT ${limit} OFFSET ${offset}`;
  return { sql, params: binder.params, countSql, countParams };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  return s === '' ? null : s;
}

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

/** A Postgres `text[]` as node-pg hands it back (an array, or a `{a,b}` literal). */
export function pgTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => v != null).map(String);
  // node-pg leaves unknown array types as a `{a,b}` literal.
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1);
    return inner ? inner.split(',').map((v) => v.replace(/^"|"$/g, '')) : [];
  }
  return [];
}

export function toImportRunListItem(row: Record<string, unknown>): ImportRunListItem {
  const staffId = numOrNull(row.triggered_by_staff_id);
  const totals = Object.fromEntries(
    (Object.keys(TOTAL_COLUMN) as Array<keyof ImportRunTotals>).map((key) => [key, num(row[TOTAL_COLUMN[key]])]),
  ) as unknown as ImportRunTotals;
  return {
    id: num(row.id),
    kind: String(row.kind) as ImportRunKind,
    trigger: String(row.trigger) as ImportRunTrigger,
    triggeredBy: staffId != null ? { staffId, name: String(row.staff_name ?? '').trim() || `Staff #${staffId}` } : null,
    status: String(row.status) as ImportRunStatus,
    startedAt: isoOrNull(row.started_at) ?? '',
    finishedAt: isoOrNull(row.finished_at),
    durationMs: numOrNull(row.duration_ms),
    sources: pgTextArray(row.sources),
    totals,
    error: strOrNull(row.error),
    cronRunId: numOrNull(row.cron_run_id),
  };
}

/** A step's JSONB counts → the typed shape; absent / non-numeric keys are 0. */
export function toImportStepCounts(value: unknown): ImportStepCounts {
  let obj: Record<string, unknown> = {};
  if (typeof value === 'string') {
    try {
      obj = JSON.parse(value) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  } else if (value && typeof value === 'object') {
    obj = value as Record<string, unknown>;
  }
  return {
    imported: num(obj.imported),
    updated: num(obj.updated),
    trackingFilled: num(obj.trackingFilled),
    ambiguous: num(obj.ambiguous),
    skipped: num(obj.skipped),
    failed: num(obj.failed),
  };
}

export function toImportRunStep(row: Record<string, unknown>): ImportRunStep {
  return {
    id: num(row.id),
    step: String(row.step),
    ok: row.ok === true,
    counts: toImportStepCounts(row.counts),
    error: strOrNull(row.error),
    startedAt: isoOrNull(row.started_at),
    finishedAt: isoOrNull(row.finished_at),
  };
}

export async function listImportRuns(
  orgId: OrgId,
  filters: ImportFilters,
  deps: ImportQueryDeps = defaultImportQueryDeps,
): Promise<ImportPage<ImportRunListItem>> {
  const q = buildImportRunsListSql(orgId, filters);
  const [rows, count] = await Promise.all([deps.run(orgId, q.sql, q.params), deps.run(orgId, q.countSql, q.countParams)]);
  return {
    ok: true,
    items: rows.map(toImportRunListItem),
    total: num(count[0]?.n),
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

/** One run with its steps; `null` when the id is not a run of this org. */
export async function getImportRunDetail(
  orgId: OrgId,
  runId: number,
  deps: ImportQueryDeps = defaultImportQueryDeps,
): Promise<ImportRunDetail | null> {
  const [runRows, stepRows] = await Promise.all([
    deps.run(orgId, runSelectSql('r.organization_id = $1 AND r.id = $2'), [orgId, runId]),
    deps.run(
      orgId,
      `SELECT s.id::float8 AS id, s.step, s.ok, s.counts, s.error, s.started_at, s.finished_at
         FROM order_import_run_steps s
        WHERE s.organization_id = $1 AND s.run_id = $2
        ORDER BY s.started_at NULLS LAST, s.id`,
      [orgId, runId],
    ),
  ]);
  const head = runRows[0];
  if (!head) return null;
  return { ...toImportRunListItem(head), steps: stepRows.map(toImportRunStep) };
}

// ── rows ────────────────────────────────────────────────────────────────────

const ROW_SORT_SQL: Readonly<Record<string, string>> = {
  newest: 'w.created_at DESC, w.id DESC',
  order: 'w.external_order_id ASC, w.id DESC',
};

export function buildImportRowsListSql(orgId: OrgId, filters: ImportFilters) {
  const binder = new ImportSqlBinder(orgId);
  const where = buildImportRowsWhere(binder, filters);
  const countSql = `SELECT COUNT(*)::int AS n FROM ${IMPORT_ROWS_FROM_SQL} WHERE ${where}`;
  const countParams = [...binder.params];
  const limit = binder.bind(filters.pageSize);
  const offset = binder.bind((filters.page - 1) * filters.pageSize);
  // Titles: the listing's catalog row by id, else the order's SKU through the
  // law's exact org-scoped join; the order's own title is only the fallback.
  const sql = `
    SELECT w.id::float8 AS id, w.run_id::float8 AS run_id, w.step_id::float8 AS step_id,
           w.order_row_id, w.external_order_id, w.account_source, w.platform, w.source, w.outcome,
           w.reason, w.filled_fields, w.tracking_number, w.shipment_id::float8 AS shipment_id,
           w.sku_catalog_id, w.item_number,
           w.shipstation_order_id::float8 AS shipstation_order_id,
           w.shipstation_shipment_id::float8 AS shipstation_shipment_id,
           w.sheet_tab, w.sheet_row, w.import_exception_id::float8 AS import_exception_id, w.created_at,
           COALESCE(sc.product_title, sco.product_title) AS catalog_product_title,
           o.product_title AS item_name,
           COALESCE(sc.sku, o.sku) AS sku
      FROM ${IMPORT_ROWS_FROM_SQL}
      LEFT JOIN orders o ON o.id = w.order_row_id AND o.organization_id = w.organization_id
      LEFT JOIN sku_catalog sc ON sc.id = w.sku_catalog_id AND sc.organization_id = w.organization_id
      LEFT JOIN sku_catalog sco ON ${skuCatalogJoinOnSql('o', 'sco')}
     WHERE ${where}
     ORDER BY ${ROW_SORT_SQL[filters.sort] ?? ROW_SORT_SQL.newest}
     LIMIT ${limit} OFFSET ${offset}`;
  return { sql, params: binder.params, countSql, countParams };
}

export function toImportRunRowItem(row: Record<string, unknown>): ImportRunRowItem {
  const title = resolveSkuIdentityTitle({
    catalog_product_title: strOrNull(row.catalog_product_title),
    item_name: strOrNull(row.item_name),
    sku: strOrNull(row.sku),
  });
  return {
    id: num(row.id),
    runId: num(row.run_id),
    stepId: numOrNull(row.step_id),
    orderRowId: numOrNull(row.order_row_id),
    externalOrderId: String(row.external_order_id ?? ''),
    accountSource: strOrNull(row.account_source),
    platform: strOrNull(row.platform),
    source: String(row.source ?? ''),
    outcome: String(row.outcome) as ImportRowOutcome,
    reason: strOrNull(row.reason),
    filledFields: pgTextArray(row.filled_fields),
    trackingNumber: strOrNull(row.tracking_number),
    shipmentId: numOrNull(row.shipment_id),
    skuCatalogId: numOrNull(row.sku_catalog_id),
    itemNumber: strOrNull(row.item_number),
    title: title || null,
    shipstationOrderId: numOrNull(row.shipstation_order_id),
    shipstationShipmentId: numOrNull(row.shipstation_shipment_id),
    sheetTab: strOrNull(row.sheet_tab),
    sheetRow: numOrNull(row.sheet_row),
    importExceptionId: numOrNull(row.import_exception_id),
    createdAt: isoOrNull(row.created_at) ?? '',
  };
}

export async function listImportRows(
  orgId: OrgId,
  filters: ImportFilters,
  deps: ImportQueryDeps = defaultImportQueryDeps,
): Promise<ImportPage<ImportRunRowItem>> {
  const q = buildImportRowsListSql(orgId, filters);
  const [rows, count] = await Promise.all([deps.run(orgId, q.sql, q.params), deps.run(orgId, q.countSql, q.countParams)]);
  return {
    ok: true,
    items: rows.map(toImportRunRowItem),
    total: num(count[0]?.n),
    page: filters.page,
    pageSize: filters.pageSize,
  };
}
