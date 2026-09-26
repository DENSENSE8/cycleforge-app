import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** Resolve the most-recent completed packer_log for a packed order — the record a packer's tracking-number scan already created… */
export async function findPackerLogForOrder(
  organizationId: string,
  orderRowId: number,
): Promise<number | null> {
  if (!Number.isFinite(orderRowId) || orderRowId <= 0) return null;

  const res = await tenantQuery<{ id: number }>(
    organizationId as OrgId,
    `SELECT pl.id
       FROM packer_logs pl
      WHERE pl.organization_id = $1
        AND pl.shipment_id IS NOT NULL
        AND pl.completion_state = 'COMPLETED'
        AND pl.shipment_id IN (
          SELECT o.shipment_id
            FROM orders o
           WHERE o.id = $2
             AND o.organization_id = $1
             AND o.shipment_id IS NOT NULL
          UNION
          SELECT osl.shipment_id
            FROM shipment_links osl
            JOIN orders o2 ON o2.id = osl.owner_id AND o2.organization_id = $1
           WHERE osl.owner_type = 'ORDER'
             AND osl.owner_id = $2
             AND osl.shipment_id IS NOT NULL
        )
      ORDER BY pl.created_at DESC NULLS LAST, pl.id DESC
      LIMIT 1`,
    [organizationId, orderRowId],
  );

  return res.rows[0] ? Number(res.rows[0].id) : null;
}
