/**
 * Shipped (`outbound.shipped`) facet counts. The list is `fetchPackerLogRows`
 * (`/api/packerlogs`); this statement reads the SAME population
 * (`buildPackerLogBaseWhere`: tenant, rows, scan-out membership, staff, picker,
 * window, exact time window) and the SAME filter fragments (`shipped-filter-sql.ts`),
 * so an option's count is by construction the list total for that pick. On top
 * of the page query it applies what the list still does in the browser to the
 * fetched rows: the exact window clip (`created_at`'s day inside the range, or
 * the `timeFrom`/`timeTo` instants) and the one-row-per-
 * package collapse (`dedupeShippedRecords` keys every Shipped row by its
 * package, since scan-out membership requires one).
 *
 * Per package, a type view matches when ANY of its rows does (filter, then
 * collapse — the list's order); carrier, status and the exception flag belong
 * to the package itself.
 *
 * Not reflected: the desk-store search (never in the URL), `?ostatus` (a state
 * derived from the whole record, applied in the browser), and a type preference
 * kept only in the browser when `shippedFilter` is absent (counts assume `all`).
 */

import { computeFacets, type FacetDimension } from '@/lib/nav/facets/compute';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import type { FacetSqlRunner } from '@/lib/nav/facets/outbound';
import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { isPackerLogEnrichmentRead } from '@/lib/feature-flags';
import { buildPackerLogBaseWhere, packerLogOrderJoins } from '@/lib/neon/packer-logs-week';
import {
  CARRIERS,
  STATUS_CATEGORIES,
  TYPE_ITEMS,
  type ShippedTypeFilter,
} from '@/lib/shipping/shipped-filter/shipped-filter-constants';
import {
  readShippedDateWindow,
  readShippedPickedBy,
  readShippedTimeWindow,
} from '@/lib/shipping/shipped-filter/shipped-filter-params';
import {
  SHIPPED_CARRIER_SQL,
  SHIPPED_EXCEPTION_SQL,
  SHIPPED_STATUS_SQL,
  readShippedDeskFilters,
  shippedFilterJoins,
  shippedTypeSql,
} from '@/lib/shipping/shipped-filter/shipped-filter-sql';
import type { OrgId } from '@/lib/tenancy/constants';

type ParamReader = Pick<URLSearchParams, 'get'>;

export interface ShippedFacetCombo {
  types: Readonly<Record<ShippedTypeFilter, boolean>>;
  carrier: string;
  status: string;
  exception: boolean;
  n: number;
}

/** `?packedBy` / `?staff` — positive numbers, else unset (the desk's `parseStaffParam`). */
function staffParam(params: ParamReader, key: string): number | null {
  const n = Number(params.get(key));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** One statement: per-package facet values, counted per combination. */
export function buildShippedFacetSql(orgId: OrgId, params: ParamReader, enriched: boolean) {
  const window = readShippedDateWindow(params);
  const timeWindow = readShippedTimeWindow(params);
  const bind: unknown[] = [];
  const { conditions, needsOrderJoins } = buildPackerLogBaseWhere(
    {
      organizationId: orgId,
      packerId: staffParam(params, 'packedBy'),
      staffId: staffParam(params, 'staff'),
      weekStart: window.start,
      weekEnd: window.end,
      shippedFrom: timeWindow?.fromIso ?? null,
      shippedTo: timeWindow?.toIso ?? null,
      pickedBy: readShippedPickedBy(params),
    },
    bind,
  );
  // The list's clip of the padded page to the window (`toPSTDateKey(created_at)`);
  // a time window replaces it with the exact instants (already bound above).
  if (window.start && window.end && !timeWindow) {
    bind.push(window.start, window.end);
    conditions.push(`to_char(sal.created_at, 'YYYY-MM-DD') BETWEEN $${bind.length - 1} AND $${bind.length}`);
  }
  const sql = `
    SELECT p.t_all, p.t_orders, p.t_sku, p.t_fba, p.carrier, p.status, p.exception, COUNT(*)::int AS n
      FROM (
        SELECT
          bool_or(${shippedTypeSql('all', enriched)}) AS t_all,
          bool_or(${shippedTypeSql('orders', enriched)}) AS t_orders,
          bool_or(${shippedTypeSql('sku', enriched)}) AS t_sku,
          bool_or(${shippedTypeSql('fba', enriched)}) AS t_fba,
          MAX(${SHIPPED_CARRIER_SQL}) AS carrier,
          MAX(${SHIPPED_STATUS_SQL}) AS status,
          bool_or(${SHIPPED_EXCEPTION_SQL}) AS exception
        FROM station_activity_logs sal
        LEFT JOIN packer_logs pl ON pl.id = sal.packer_log_id${needsOrderJoins ? packerLogOrderJoins(enriched) : ''}${shippedFilterJoins(enriched)}
        WHERE ${conditions.join(' AND ')}
        GROUP BY sal.shipment_id
      ) p
     GROUP BY 1, 2, 3, 4, 5, 6, 7`;
  return { sql, params: bind };
}

function toShippedCombo(row: Record<string, unknown>): ShippedFacetCombo {
  return {
    types: {
      all: row.t_all === true,
      orders: row.t_orders === true,
      sku: row.t_sku === true,
      fba: row.t_fba === true,
    },
    carrier: String(row.carrier ?? ''),
    status: String(row.status ?? ''),
    exception: row.exception === true,
    n: Number(row.n) || 0,
  };
}

function shippedDimensions(): FacetDimension<ShippedFacetCombo>[] {
  const decl = (id: string) => {
    const group = NAV_FACET_GROUPS['outbound.shipped'].find((g) => g.id === id);
    if (!group) throw new Error(`outbound.shipped declares no ${id} group`);
    return group;
  };
  return [
    {
      groupId: 'type', label: decl('type').label, param: decl('type').param,
      options: TYPE_ITEMS.map((item) => ({ value: String(item.id), label: item.label })),
      matches: (row, value) => row.types[value as ShippedTypeFilter] === true,
    },
    {
      groupId: 'carrier', label: decl('carrier').label, param: decl('carrier').param,
      options: CARRIERS.map((c) => ({ value: c.value, label: c.label })),
      matches: (row, value) => row.carrier === value,
    },
    {
      groupId: 'status', label: decl('status').label, param: decl('status').param,
      options: STATUS_CATEGORIES.map((s) => ({ value: s.value, label: s.label })),
      matches: (row, value) => row.status === value,
    },
    {
      groupId: 'exceptions', label: decl('exceptions').label, param: decl('exceptions').param,
      options: [{ value: '1', label: 'Exception or stalled' }],
      matches: (row, value) => value === '1' && row.exception,
    },
  ];
}

export async function shippedFacets(orgId: OrgId, params: ParamReader, run: FacetSqlRunner): Promise<NavFacetsResponse> {
  const filters = readShippedDeskFilters(params);
  const read = async (enriched: boolean) => {
    const { sql, params: bind } = buildShippedFacetSql(orgId, params, enriched);
    return run(sql, bind);
  };
  let rows: Array<Record<string, unknown>>;
  try {
    rows = await read(isPackerLogEnrichmentRead());
  } catch (error) {
    // Same fallback as the list: a DB without `packer_log_enrichment` reads the legacy match.
    if ((error as { code?: string })?.code !== '42P01') throw error;
    rows = await read(false);
  }
  const { total, groups } = computeFacets(rows.map(toShippedCombo), shippedDimensions(), {
    type: filters.type ?? 'all',
    carrier: filters.carrier,
    status: filters.statusCategory,
    exceptions: filters.exceptionsOnly ? '1' : null,
  });
  return { context: 'outbound.shipped', total, groups };
}
