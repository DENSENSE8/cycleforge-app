/**
 * The five outbound desk-sidebar numbers in one read — `GET /api/orders/desk-counts`.
 *
 * Each number is the SAME membership rule as the list its view opens:
 * - `exceptions`   → `listOrderExceptions` actionable scope (`/shipping/exceptions`)
 * - `po`           → `/api/orders?blockedOnly=true&pair=po` (`/shipping/shortage?pair=po`)
 * - `pick`         → `/api/orders?inWarehouse=true&queue=pick` (`/shipping/orders?queue=pick`)
 * - `triage`       → `/api/orders?inWarehouse=true` (`/shipping/orders`)
 * - `shippedToday` → PACK-station activity since the org's local midnight —
 *   the feed the Shipped desk lists (same rule as queue-counts' `shippedToday`),
 *   in `organizations.settings.timezone` when it names a real zone, else UTC.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { countOrderExceptions } from '@/lib/orders/order-exceptions';
import type { DeskCounts } from '@/lib/orders/desk-view-filters';
import {
  sqlOrderAwaitingPick,
  sqlOrderBlockedPending,
  sqlOrderHasPoPairedShortage,
  sqlOrderInWarehouseToShip,
} from '@/lib/orders/desk-view-sql';

const TO_SHIP_COUNTS_SQL = `
  SELECT
    COUNT(*)::int AS triage,
    COUNT(*) FILTER (WHERE ${sqlOrderAwaitingPick('o')})::int AS pick
  FROM orders o
  LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
  WHERE o.organization_id = $1
    AND ${sqlOrderInWarehouseToShip('o')}
`;

const PO_PAIRED_COUNT_SQL = `
  SELECT COUNT(*)::int AS n
  FROM orders o
  WHERE o.organization_id = $1
    AND ${sqlOrderBlockedPending('o')}
    AND ${sqlOrderHasPoPairedShortage('o')}
`;

/*
 * Local-day window as a timestamptz RANGE (index-friendly, DST-exact: the
 * upper bound is the next local midnight, not start + 24h). An unset or
 * unknown zone name falls back to UTC rather than erroring the whole read.
 */
const SHIPPED_TODAY_SQL = `
  WITH tz AS (
    SELECT COALESCE((
      SELECT tzn.name
        FROM organizations org
        JOIN pg_timezone_names tzn ON tzn.name = org.settings->>'timezone'
       WHERE org.id = $1
       LIMIT 1
    ), 'UTC') AS name
  )
  SELECT COUNT(*)::int AS n
  FROM station_activity_logs sal, tz
  WHERE sal.organization_id = $1
    AND sal.station = 'PACK'
    AND sal.created_at >= (date_trunc('day', NOW() AT TIME ZONE tz.name) AT TIME ZONE tz.name)
    AND sal.created_at < ((date_trunc('day', NOW() AT TIME ZONE tz.name) + INTERVAL '1 day') AT TIME ZONE tz.name)
`;

export async function getDeskCounts(orgId: OrgId): Promise<DeskCounts> {
  const [exceptions, toShip, po, shipped] = await Promise.all([
    countOrderExceptions(orgId, 'actionable'),
    tenantQuery<{ triage: number; pick: number }>(orgId, TO_SHIP_COUNTS_SQL, [orgId]),
    tenantQuery<{ n: number }>(orgId, PO_PAIRED_COUNT_SQL, [orgId]),
    tenantQuery<{ n: number }>(orgId, SHIPPED_TODAY_SQL, [orgId]),
  ]);
  return {
    exceptions,
    po: Number(po.rows[0]?.n) || 0,
    pick: Number(toShip.rows[0]?.pick) || 0,
    triage: Number(toShip.rows[0]?.triage) || 0,
    shippedToday: Number(shipped.rows[0]?.n) || 0,
  };
}
