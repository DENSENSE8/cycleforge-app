/**
 * Import record facet counts (`imports.runs` · `imports.rows`). The lists are
 * `/api/imports/runs` and `/api/imports/rows`; these statements read the SAME
 * population through the SAME WHERE builders (`src/lib/imports/queries.ts`)
 * with the multi-value facet predicates left out, and `computeFacets` applies
 * those in memory — so an option's count is the list total for that pick, and
 * a group never narrows its own options.
 *
 * Multi-value: a group's active value is its comma-joined param; a row matches
 * when its value is ANY of them (a run: when ANY of its steps is). A run's
 * status is one value.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { computeFacets, type FacetDimension } from '@/lib/nav/facets/compute';
import { NAV_FACET_GROUPS, type NavFacetContext } from '@/lib/nav/facets/contexts';
import type { FacetSqlRunner } from '@/lib/nav/facets/outbound';
import { parseImportParams, type ImportFilters } from '@/lib/imports/params';
import {
  IMPORT_EXCEPTIONS_STEP,
  IMPORT_ROWS_FROM_SQL,
  ImportSqlBinder,
  buildImportRowsWhere,
  buildImportRunsWhere,
  pgTextArray,
} from '@/lib/imports/queries';
import { IMPORT_RUN_STATUS_LABELS } from '@/lib/imports/record-faces';
import { IMPORT_ROW_OUTCOMES, IMPORT_RUN_STATUSES, type ImportRowOutcome } from '@/lib/imports/types';
import { providerCatalogLabel } from '@/lib/integrations/capability-labels';
import type { OrgId } from '@/lib/tenancy/constants';

type ParamReader = Pick<URLSearchParams, 'get'> & Partial<Pick<URLSearchParams, 'getAll'>>;

export interface ImportRunFacetCombo {
  status: string;
  /** Distinct non-exceptions steps the run ran. */
  sources: readonly string[];
  n: number;
}

export interface ImportRowFacetCombo {
  source: string;
  platform: string | null;
  account: string | null;
  outcome: string;
  n: number;
}

export const IMPORT_OUTCOME_LABELS: Readonly<Record<ImportRowOutcome, string>> = {
  inserted: 'Inserted',
  backfilled: 'Backfilled',
  adopted: 'Adopted',
  claimed: 'Claimed',
  tracking_filled: 'Tracking filled',
  unchanged: 'Unchanged',
  ambiguous: 'Ambiguous',
  quarantined: 'Quarantined',
  skipped: 'Skipped',
  failed: 'Failed',
};

/** A step / source name as the operator reads it (`google_sheets` → Google Sheets). */
export function importSourceLabel(source: string): string {
  return source === IMPORT_EXCEPTIONS_STEP ? 'Exceptions' : providerCatalogLabel(source);
}

export function buildImportRunFacetSql(orgId: OrgId, filters: ImportFilters) {
  const binder = new ImportSqlBinder(orgId);
  const where = buildImportRunsWhere(binder, filters, { omitFacets: true });
  const sql = `
    SELECT r.status, COALESCE(sp.sources, ARRAY[]::text[]) AS sources, COUNT(*)::int AS n
      FROM order_import_runs r
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT s.step ORDER BY s.step) AS sources
          FROM order_import_run_steps s
         WHERE s.organization_id = r.organization_id AND s.run_id = r.id AND s.step <> '${IMPORT_EXCEPTIONS_STEP}'
      ) sp ON TRUE
     WHERE ${where}
     GROUP BY 1, 2`;
  return { sql, params: binder.params };
}

export function buildImportRowFacetSql(orgId: OrgId, filters: ImportFilters) {
  const binder = new ImportSqlBinder(orgId);
  const where = buildImportRowsWhere(binder, filters, { omitFacets: true });
  const sql = `
    SELECT w.source, w.platform, w.account_source AS account, w.outcome, COUNT(*)::int AS n
      FROM ${IMPORT_ROWS_FROM_SQL}
     WHERE ${where}
     GROUP BY 1, 2, 3, 4`;
  return { sql, params: binder.params };
}

function decl(context: NavFacetContext, id: string) {
  const group = NAV_FACET_GROUPS[context].find((g) => g.id === id);
  if (!group) throw new Error(`${context} declares no ${id} group`);
  return group;
}

/**
 * Options of a data-driven group: every value the population holds, plus any
 * active value it no longer holds (so the chip still shows, at 0), by label.
 */
function discoveredOptions(values: Iterable<string | null>, active: readonly string[], label: (v: string) => string) {
  const set = new Set<string>(active);
  for (const value of values) if (value) set.add(value);
  return [...set]
    .map((value) => ({ value, label: label(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const anyOf = (active: string, value: string | null) => value != null && active.split(',').includes(value);

export function importRunDimensions(
  combos: readonly ImportRunFacetCombo[],
  filters: ImportFilters,
): FacetDimension<ImportRunFacetCombo>[] {
  const g = (id: string) => decl('imports.runs', id);
  return [
    {
      // A fixed vocabulary: every status is offered, in the run's order.
      groupId: 'status', label: g('status').label, param: g('status').param,
      options: IMPORT_RUN_STATUSES.map((value) => ({ value, label: IMPORT_RUN_STATUS_LABELS[value] })),
      matches: (row, value) => row.status === value,
    },
    {
      groupId: 'source', label: g('source').label, param: g('source').param,
      options: discoveredOptions(combos.flatMap((c) => c.sources), filters.sources, importSourceLabel),
      matches: (row, value) => row.sources.some((source) => anyOf(value, source)),
    },
  ];
}

export function importRowDimensions(
  combos: readonly ImportRowFacetCombo[],
  filters: ImportFilters,
): FacetDimension<ImportRowFacetCombo>[] {
  const g = (id: string) => decl('imports.rows', id);
  return [
    {
      groupId: 'source', label: g('source').label, param: g('source').param,
      options: discoveredOptions(combos.map((c) => c.source), filters.sources, importSourceLabel),
      matches: (row, value) => anyOf(value, row.source),
    },
    {
      groupId: 'platform', label: g('platform').label, param: g('platform').param,
      options: discoveredOptions(combos.map((c) => c.platform), filters.platforms, providerCatalogLabel),
      matches: (row, value) => anyOf(value, row.platform),
    },
    {
      groupId: 'account', label: g('account').label, param: g('account').param,
      options: discoveredOptions(combos.map((c) => c.account), filters.accounts, (v) => v),
      matches: (row, value) => anyOf(value, row.account),
    },
    {
      // A fixed vocabulary: every outcome is offered, in the record's order.
      groupId: 'outcome', label: g('outcome').label, param: g('outcome').param,
      options: IMPORT_ROW_OUTCOMES.map((value) => ({ value, label: IMPORT_OUTCOME_LABELS[value] })),
      matches: (row, value) => anyOf(value, row.outcome),
    },
  ];
}

const joined = (values: readonly string[]) => (values.length > 0 ? values.join(',') : null);

export async function importFacets(
  context: 'imports.runs' | 'imports.rows',
  orgId: OrgId,
  params: ParamReader,
  run: FacetSqlRunner,
): Promise<NavFacetsResponse> {
  if (context === 'imports.runs') {
    const filters = parseImportParams('runs', params);
    const { sql, params: bind } = buildImportRunFacetSql(orgId, filters);
    const combos = (await run(sql, bind)).map((r): ImportRunFacetCombo => ({
      status: String(r.status ?? ''),
      sources: pgTextArray(r.sources),
      n: Number(r.n) || 0,
    }));
    const { total, groups } = computeFacets(combos, importRunDimensions(combos, filters), {
      status: filters.status,
      source: joined(filters.sources),
    });
    return { context, total, groups };
  }
  const filters = parseImportParams('rows', params);
  const { sql, params: bind } = buildImportRowFacetSql(orgId, filters);
  const combos = (await run(sql, bind)).map((r): ImportRowFacetCombo => ({
    source: String(r.source ?? ''),
    platform: r.platform == null ? null : String(r.platform),
    account: r.account == null ? null : String(r.account),
    outcome: String(r.outcome ?? ''),
    n: Number(r.n) || 0,
  }));
  const { total, groups } = computeFacets(combos, importRowDimensions(combos, filters), {
    source: joined(filters.sources),
    platform: joined(filters.platforms),
    account: joined(filters.accounts),
    outcome: joined(filters.outcomes),
  });
  return { context, total, groups };
}
