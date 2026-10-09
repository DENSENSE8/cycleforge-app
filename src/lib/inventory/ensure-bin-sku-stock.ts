import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export type EnsuredSkuStock = { stockId: number; created: boolean };

/**
 * The `sku_stock` row of a SKU that sits in one of this org's bins, created on
 * demand: photos hang off `sku_stock.id` (`SKU_STOCK` links), so a bin SKU
 * with no row yet would otherwise have nowhere to put its first photo. A new
 * row carries the ledger projection `fn_recompute_sku_stock` would write, so
 * its stock matches the ledger from the start. Null when the SKU is in no bin
 * of this org — the endpoint never mints rows for arbitrary text.
 */
export async function ensureBinSkuStock(orgId: OrgId, sku: string): Promise<EnsuredSkuStock | null> {
  return withTenantTransaction(orgId, async (client) => {
    const existing = await client.query<{ id: number }>(
      `SELECT id FROM sku_stock WHERE organization_id = $1 AND sku = $2 LIMIT 1`,
      [orgId, sku],
    );
    if (existing.rows[0]) return { stockId: Number(existing.rows[0].id), created: false };

    const inBin = await client.query(
      `SELECT 1 FROM bin_contents WHERE organization_id = $1 AND sku = $2 LIMIT 1`,
      [orgId, sku],
    );
    if (inBin.rowCount === 0) return null;

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO sku_stock (sku, stock, boxed_stock, organization_id)
       SELECT $2,
              COALESCE(SUM(CASE WHEN dimension = 'WAREHOUSE' THEN delta ELSE 0 END), 0)::int,
              COALESCE(SUM(CASE WHEN dimension = 'BOXED' THEN delta ELSE 0 END), 0)::int,
              $1
         FROM sku_stock_ledger
        WHERE organization_id = $1 AND sku = $2
       ON CONFLICT (organization_id, sku) DO NOTHING
       RETURNING id`,
      [orgId, sku],
    );
    if (inserted.rows[0]) return { stockId: Number(inserted.rows[0].id), created: true };

    // A concurrent writer won the insert: read its row.
    const raced = await client.query<{ id: number }>(
      `SELECT id FROM sku_stock WHERE organization_id = $1 AND sku = $2 LIMIT 1`,
      [orgId, sku],
    );
    return raced.rows[0] ? { stockId: Number(raced.rows[0].id), created: false } : null;
  });
}
