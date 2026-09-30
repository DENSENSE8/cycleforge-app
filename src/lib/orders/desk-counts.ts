/** The four outbound desk lens totals in one read — `GET /api/orders/desk-counts`. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { countOrderExceptions } from '@/lib/orders/order-exceptions';
import type { DeskCounts } from '@/lib/orders/desk-view-filters';
import { sqlDeskQueueScope, sqlShippedTodayCount } from '@/lib/orders/desk-view-sql';

/*
 * One statement, one round trip. Each number is the SAME predicate the list
 * behind it filters with (`sqlDeskQueueScope` — `/api/orders?inWarehouse`,
 * `pair=po`), so a badge can never disagree with its list.
 */
const DESK_COUNTS_SQL = `
  SELECT
    (
      SELECT COUNT(*)::int
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE o.organization_id = $1
        AND ${sqlDeskQueueScope('triage', 'o')}
    ) AS triage,
    (
      SELECT COUNT(*)::int
      FROM orders o
      WHERE o.organization_id = $1
        AND ${sqlDeskQueueScope('po', 'o')}
    ) AS po,
    ${sqlShippedTodayCount('$1')} AS shipped_today
`;

export async function getDeskCounts(orgId: OrgId): Promise<DeskCounts> {
  const [exceptions, counts] = await Promise.all([
    countOrderExceptions(orgId, 'actionable'),
    tenantQuery<{ triage: number; po: number; shipped_today: number }>(
      orgId,
      DESK_COUNTS_SQL,
      [orgId],
    ),
  ]);
  const row = counts.rows[0];
  return {
    exceptions,
    po: Number(row?.po) || 0,
    triage: Number(row?.triage) || 0,
    shippedToday: Number(row?.shipped_today) || 0,
  };
}
