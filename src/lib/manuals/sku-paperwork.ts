import 'server-only';

/**
 * SKU-level paperwork facts — what a SKU-scope pair reaches, and the SKU's
 * "never ships with paperwork" flag (`sku_catalog.paperwork_not_required`).
 * Routes: `GET /api/sku-catalog/[id]/paperwork-reach`,
 * `PATCH /api/sku-catalog/[id]/paperwork-required`.
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SkuPaperworkReach } from '@/lib/label-prints/order-packet-contracts';
import { sqlOrderNotBuyerCancelled, sqlOrderOpenUnshipped } from '@/lib/orders/desk-view-sql';
import { skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';

/**
 * Open orders (Allocate's open predicate) with a line on this SKU — the line's
 * catalog id, else the catalog row of its SKU text, exactly as G2 resolves it.
 * `null` when the SKU is not this org's.
 */
export async function getSkuPaperworkReach(orgId: OrgId, skuCatalogId: number): Promise<SkuPaperworkReach | null> {
  const res = await tenantQuery<{ open_orders: number | string }>(
    orgId,
    `SELECT (
       SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(o.order_id), ''), o.id::text))::int
         FROM orders o
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
        WHERE o.organization_id = sc.organization_id
          AND (o.sku_catalog_id = sc.id OR (o.sku_catalog_id IS NULL AND ${skuCatalogJoinOnSql('o', 'sc')}))
          AND ${sqlOrderOpenUnshipped('o')}
          AND ${sqlOrderNotBuyerCancelled('o')}
     ) AS open_orders
       FROM sku_catalog sc
      WHERE sc.organization_id = $1 AND sc.id = $2`,
    [orgId, skuCatalogId],
  );
  const row = res.rows[0];
  return row ? { skuCatalogId, openOrders: Number(row.open_orders) || 0 } : null;
}

/** Set the SKU's Not required flag. Returns the flag before and after; `null` when the SKU is not this org's. */
export async function setSkuPaperworkNotRequired(
  orgId: OrgId,
  skuCatalogId: number,
  notRequired: boolean,
): Promise<{ before: boolean; after: boolean } | null> {
  return withTenantTransaction(orgId, async (client) => {
    const current = await client.query<{ paperwork_not_required: boolean }>(
      `SELECT paperwork_not_required FROM sku_catalog WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
      [orgId, skuCatalogId],
    );
    const row = current.rows[0];
    if (!row) return null;
    if (row.paperwork_not_required !== notRequired) {
      await client.query(
        `UPDATE sku_catalog SET paperwork_not_required = $3, updated_at = NOW() WHERE organization_id = $1 AND id = $2`,
        [orgId, skuCatalogId, notRequired],
      );
    }
    return { before: row.paperwork_not_required, after: notRequired };
  });
}
