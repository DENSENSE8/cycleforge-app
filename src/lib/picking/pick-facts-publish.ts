/**
 * After a pick write commits — a desk serial pick, or any pick reversal —
 * re-state each touched order's pick fact on the orders channel.
 * `order.picked` carries the refreshed `order_stage_facts` row (`picked` =
 * has_pick_scan) so desk and phone caches patch in place — `picked: false`
 * sends the row back to pending, a partial undo that leaves the scan live
 * keeps it picked — and `order.changed` repaints everything else keyed on
 * the order.
 */
import 'server-only';
import { publishOrderChanged, publishOrderPicked } from '@/lib/realtime/publish';
import { withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export async function publishOrderPickFacts(
  orgId: OrgId,
  orderIds: readonly (number | null | undefined)[],
  source: string,
): Promise<void> {
  const ids = [...new Set(orderIds.filter((id): id is number => Number.isInteger(id) && Number(id) > 0))];
  if (ids.length === 0) return;
  try {
    const { rows } = await withTenantConnection(orgId, (client) =>
      client.query<{
        order_id: number;
        has_pick_scan: boolean | null;
        picked_by: number | null;
        picked_by_name: string | null;
        picked_at: string | null;
      }>(
        `SELECT o.id AS order_id,
                COALESCE(osf.has_pick_scan, false) AS has_pick_scan,
                osf.picked_by,
                s.name AS picked_by_name,
                to_char(osf.picked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS picked_at
           FROM orders o
           LEFT JOIN order_stage_facts osf
             ON osf.organization_id = o.organization_id AND osf.order_id = o.id
           LEFT JOIN staff s
             ON s.id = osf.picked_by AND s.organization_id = o.organization_id
          WHERE o.organization_id = $1 AND o.id = ANY($2::int[])`,
        [orgId, ids],
      ),
    );
    for (const row of rows) {
      const picked = Boolean(row.has_pick_scan);
      await publishOrderPicked({
        organizationId: orgId,
        orderId: Number(row.order_id),
        picked,
        pickedBy: picked ? row.picked_by : null,
        pickedByName: picked ? row.picked_by_name : null,
        pickedAt: picked ? row.picked_at : null,
        source,
      });
    }
    await publishOrderChanged({ organizationId: orgId, orderIds: ids, source });
  } catch (err) {
    console.warn(`[${source}] pick reversal publish failed`, err);
  }
}
