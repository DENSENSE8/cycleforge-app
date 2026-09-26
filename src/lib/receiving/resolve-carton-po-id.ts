import { tenantQuery } from '@/lib/tenancy/db';

/** Resolve the Zoho purchase-order id for a carton (receiving row). */
export async function resolveCartonZohoPoId(
  orgId: string,
  receivingId: number,
): Promise<string | null> {
  const res = await tenantQuery<{ zoho_purchaseorder_id: string | null }>(
    orgId,
    `SELECT COALESCE(
              NULLIF(r.zoho_purchaseorder_id, ''),
              (SELECT NULLIF(rz.zoho_purchaseorder_id, '')
                 FROM receiving_line rl
                 JOIN receiving_line_zoho rz
                   ON rz.receiving_line_id = rl.id
                  AND rz.organization_id = rl.organization_id
                WHERE rl.receiving_id = r.id
                  AND rl.organization_id = r.organization_id
                  AND NULLIF(rz.zoho_purchaseorder_id, '') IS NOT NULL
                ORDER BY rl.id ASC
                LIMIT 1)
            ) AS zoho_purchaseorder_id
       FROM receiving_carton r
      WHERE r.id = $1 AND r.organization_id = $2
      LIMIT 1`,
    [receivingId, orgId],
  );
  const v = String(res.rows[0]?.zoho_purchaseorder_id ?? '').trim();
  return v || null;
}
