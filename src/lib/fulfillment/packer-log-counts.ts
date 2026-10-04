/**
 * `/api/packerlogs/counts` — Fulfilled packages per warehouse day, counted in
 * SQL. The population is the Fulfilled list's (`buildPackerLogBaseWhere`:
 * tenant, rows, staffed scan-out membership, packer / staff, window); a package
 * counts once, on the civil day of its latest staffed SHIP_CONFIRM — the day
 * Fulfilled's date filter files it under, so `byDay[d]` is that day's list total.
 */

import 'server-only';
import { isPackerLogEnrichmentRead } from '@/lib/feature-flags';
import { sqlWarehouseDay } from '@/lib/orders/desk-view-sql';
import {
  buildPackerLogBaseWhere,
  packerLogOrderJoins,
  sqlLatestShipConfirmAt,
} from '@/lib/neon/packer-logs-week';
import { shippedTimeWindow } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { isDateKey } from '@/utils/date';

export interface PackerLogCountsFilter {
  packerId: number | null;
  staffId: number | null;
  /** Inclusive civil-day window; both or neither (neither = every day). */
  weekStart: string;
  weekEnd: string;
}

export interface PackerLogCounts {
  total: number;
  byDay: Record<string, number>;
}

function buildPackerLogCountsSql(orgId: OrgId, filter: PackerLogCountsFilter, enriched: boolean) {
  const bounded = isDateKey(filter.weekStart) && isDateKey(filter.weekEnd);
  // The named days are the exact warehouse instant window, as the facet counts read them.
  const exact = bounded ? shippedTimeWindow({ dateFrom: filter.weekStart, dateTo: filter.weekEnd }) : null;
  const params: unknown[] = [];
  const { conditions, needsOrderJoins } = buildPackerLogBaseWhere(
    {
      organizationId: orgId,
      packerId: filter.packerId,
      staffId: filter.staffId,
      weekStart: bounded ? filter.weekStart : '',
      weekEnd: bounded ? filter.weekEnd : '',
      shippedFrom: exact?.fromIso ?? null,
      shippedTo: exact?.toIso ?? null,
    },
    params,
  );
  const sql = `
    SELECT to_char(${sqlWarehouseDay(sqlLatestShipConfirmAt())}, 'YYYY-MM-DD') AS day,
           COUNT(DISTINCT sal.shipment_id)::int AS n
      FROM station_activity_logs sal
      LEFT JOIN packer_logs pl ON pl.id = sal.packer_log_id${needsOrderJoins ? packerLogOrderJoins(enriched) : ''}
     WHERE ${conditions.join(' AND ')}
     GROUP BY 1`;
  return { sql, params };
}

export async function countPackerLogsByDay(orgId: OrgId, filter: PackerLogCountsFilter): Promise<PackerLogCounts> {
  const read = async (enriched: boolean) => {
    const { sql, params } = buildPackerLogCountsSql(orgId, filter, enriched);
    return (await tenantQuery<{ day: string; n: number }>(orgId, sql, params)).rows;
  };
  let rows: Array<{ day: string; n: number }>;
  try {
    rows = await read(isPackerLogEnrichmentRead());
  } catch (error) {
    // Same fallback as the list: a DB without `packer_log_enrichment` reads the legacy match.
    const missingTable = typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01';
    if (!missingTable) throw error;
    rows = await read(false);
  }
  const byDay: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const n = Number(row.n) || 0;
    byDay[row.day] = n;
    total += n;
  }
  return { total, byDay };
}
