import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** How many distinct listings in this org have orders that never linked to a catalog SKU — the "Needs item number" queue depth. */
export async function countUnpairedListings(orgId: OrgId): Promise<number> {
  const result = await tenantQuery<{ total: number }>(
    orgId,
    `SELECT COUNT(DISTINCT (o.item_number, o.account_source))::int AS total
       FROM orders o
      WHERE o.sku_catalog_id IS NULL
        AND o.organization_id = $1
        AND o.item_number IS NOT NULL
        AND BTRIM(COALESCE(o.item_number, '')) <> ''`,
    [orgId],
  );
  return result.rows[0]?.total ?? 0;
}
