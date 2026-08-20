import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * How many distinct listings in this org have orders that never linked to a
 * catalog SKU — the "Needs item number" queue depth.
 *
 * Deliberately the SAME predicate as `GET /api/sku-catalog/unpaired`'s `total`,
 * which computed exactly this number and had zero frontend consumers. It counts
 * DISTINCT `(item_number, account_source)` rather than orders, because that is
 * the unit of work: one link heals every order sharing the listing
 * (`batchPair`'s set-based cascade), so an order count would tell the operator
 * a job is twelve times bigger than it is.
 *
 * Blank item numbers are excluded here as they are there — an order that names
 * no product has nothing to ask about. Since `resolveListingIdentity` fills the
 * SKU in on a catalog miss, CSV and connector orders now land inside this
 * count instead of below it.
 */
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
