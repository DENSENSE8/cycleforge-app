/** Which staff are OUT on a PST date — the signal listing automations use to fall back from a rule's primary assignee to its backup. */

import { fromZonedTime } from 'date-fns-tz';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { QueryClient } from '@/lib/work-assignments/upsert-order-assignment';
import { STAFF_SCHEDULE_TIMEZONE, getCurrentStaffDayOfWeek } from '@/lib/staff-schedule';
import { getWeekStartDateKeyForDateKey } from '@/lib/staff-availability';
import { getCurrentPSTDateKey } from '@/utils/date';

const SIGNAL_TABLES = [
  'staff_weekly_schedule',
  'staff_week_plans',
  'staff_schedule_overrides',
  'staff_availability_rules',
  'time_off_requests',
] as const;

type SignalTable = (typeof SIGNAL_TABLES)[number];

/** Re-probe a partially migrated DB this often so a new table is picked up. */
const MISSING_TABLE_RECHECK_MS = 5 * 60_000;

let tableCache: { present: ReadonlySet<SignalTable>; checkedAt: number } | null = null;

async function runQuery<T>(
  organizationId: OrgId,
  client: QueryClient | undefined,
  sql: string,
  params: unknown[],
): Promise<T[]> {
  if (client) return (await client.query(sql, params)).rows as T[];
  return (await tenantQuery(organizationId, sql, params)).rows as T[];
}

async function presentSignalTables(
  organizationId: OrgId,
  client: QueryClient | undefined,
): Promise<ReadonlySet<SignalTable>> {
  const now = Date.now();
  if (
    tableCache &&
    (tableCache.present.size === SIGNAL_TABLES.length ||
      now - tableCache.checkedAt < MISSING_TABLE_RECHECK_MS)
  ) {
    return tableCache.present;
  }
  const rows = await runQuery<{ name: SignalTable }>(
    organizationId,
    client,
    `SELECT t AS name FROM unnest($1::text[]) AS t WHERE to_regclass(t) IS NOT NULL`,
    [[...SIGNAL_TABLES]],
  );
  const present = new Set(rows.map((r) => r.name));
  tableCache = { present, checkedAt: now };
  return present;
}

/**
 * Build the out-today query for whichever signal tables exist.
 * Params: $1 org, $2 staff ids, $3 PST day of week, $4 date key, $5 week start.
 */
function buildStaffOutSql(present: ReadonlySet<SignalTable>): string {
  const joins: string[] = [];
  const scheduleSources: string[] = [];
  if (present.has('staff_schedule_overrides')) {
    joins.push(`LEFT JOIN staff_schedule_overrides sso
                 ON sso.staff_id = s.id AND sso.schedule_date = $4::date`);
    scheduleSources.push('sso.is_scheduled');
  }
  if (present.has('staff_week_plans')) {
    joins.push(`LEFT JOIN staff_week_plans swp
                 ON swp.staff_id = s.id
                AND swp.week_start_date = $5::date
                AND swp.day_of_week = $3`);
    scheduleSources.push('swp.is_scheduled');
  }
  if (present.has('staff_weekly_schedule')) {
    joins.push(`LEFT JOIN staff_weekly_schedule sws
                 ON sws.staff_id = s.id AND sws.day_of_week = $3`);
    scheduleSources.push('sws.is_scheduled');
  }
  let allowedExpr = 'true';
  if (present.has('staff_availability_rules')) {
    joins.push(`LEFT JOIN LATERAL (
                  WITH applicable AS (
                    SELECT sar.day_of_week, sar.is_allowed
                      FROM staff_availability_rules sar
                     WHERE sar.staff_id = s.id
                       AND sar.deleted_at IS NULL
                       AND sar.rule_type = 'weekday_allowed'
                       AND (sar.effective_start_date IS NULL OR sar.effective_start_date <= $4::date)
                       AND (sar.effective_end_date IS NULL OR sar.effective_end_date >= $4::date)
                  )
                  SELECT CASE
                    WHEN EXISTS (SELECT 1 FROM applicable) THEN
                      COALESCE((SELECT bool_or(a.is_allowed) FROM applicable a WHERE a.day_of_week = $3), false)
                      AND NOT COALESCE((SELECT bool_or(NOT a.is_allowed) FROM applicable a WHERE a.day_of_week = $3), false)
                    ELSE true
                  END AS is_allowed
                ) sar ON true`);
    allowedExpr = 'COALESCE(sar.is_allowed, true)';
  }
  const scheduledExpr = `COALESCE(${[...scheduleSources, 'true'].join(', ')})`;
  // Approved time off overlapping [00:00, 24:00) of that PST day.
  const timeOffExpr = present.has('time_off_requests')
    ? `EXISTS (
         SELECT 1 FROM time_off_requests tor
          WHERE tor.staff_id = s.id
            AND tor.status = 'approved'
            AND tor.starts_at < (($4::date + 1)::timestamp AT TIME ZONE '${STAFF_SCHEDULE_TIMEZONE}')
            AND tor.ends_at > ($4::date::timestamp AT TIME ZONE '${STAFF_SCHEDULE_TIMEZONE}')
       )`
    : 'false';

  return `
    SELECT s.id,
           (
             s.active IS NOT TRUE
             OR NOT (${scheduledExpr} AND ${allowedExpr})
             OR ${timeOffExpr}
           ) AS is_out
      FROM staff s
      ${joins.join('\n      ')}
     WHERE s.organization_id = $1
       AND s.id = ANY($2::int[])`;
}

/**
 * The subset of `staffIds` that are OUT on the PST date `dateKey` (default
 * today). An id with no staff row in this org counts as out — a rule never
 * assigns work to a deleted or foreign staffer.
 */
export async function listStaffOutOnDate(
  organizationId: OrgId,
  staffIds: number[],
  opts?: { dateKey?: string; client?: QueryClient },
): Promise<Set<number>> {
  const ids = [...new Set(staffIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return new Set();

  const dateKey = opts?.dateKey ?? getCurrentPSTDateKey();
  const dayOfWeek = getCurrentStaffDayOfWeek(
    fromZonedTime(`${dateKey}T12:00:00`, STAFF_SCHEDULE_TIMEZONE),
  );
  const weekStart = getWeekStartDateKeyForDateKey(dateKey);
  const present = await presentSignalTables(organizationId, opts?.client);

  const rows = await runQuery<{ id: number; is_out: boolean }>(
    organizationId,
    opts?.client,
    buildStaffOutSql(present),
    [organizationId, ids, dayOfWeek, dateKey, weekStart],
  );
  const known = new Set<number>();
  const out = new Set<number>();
  for (const row of rows) {
    const id = Number(row.id);
    known.add(id);
    if (row.is_out) out.add(id);
  }
  for (const id of ids) if (!known.has(id)) out.add(id);
  return out;
}
