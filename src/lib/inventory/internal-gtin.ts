/** internal-gtin.ts ──────────────────────────────────────────────────────────────────── Internal pseudo-GTIN generator for USAV unit labels. */

import { queryOne } from '@/lib/neon-client';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { generateInternalGtin } from './internal-gtin-format';

/** Returns the GTIN for a sku_catalog row, generating + persisting one if it doesn't already have a value. */
export async function getOrCreateInternalGtin(
  skuCatalogId: number,
  orgId?: OrgId,
): Promise<string> {
  if (orgId) {
    // Tenant-scoped path: read + write inside one transaction with the
    // org GUC set, and explicit organization_id predicates for defense
    // in depth (matches the future FORCE-RLS posture).
    return withTenantTransaction(orgId, async (client) => {
      // Fast path: read existing (org-scoped).
      const existingRes = await client.query<{ gtin: string | null }>(
        'SELECT gtin FROM sku_catalog WHERE id = $1 AND organization_id = $2 LIMIT 1',
        [skuCatalogId, orgId],
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        // Org-ownership 404: either the id doesn't exist or isn't this org's.
        throw new Error(`getOrCreateInternalGtin: sku_catalog id ${skuCatalogId} not found`);
      }
      if (existing.gtin && existing.gtin.trim()) return existing.gtin.trim();

      // Generate + persist. COALESCE so a concurrent writer's value wins
      // and we return the final stored value, not our newly-computed one.
      const candidate = generateInternalGtin(skuCatalogId);
      const updatedRes = await client.query<{ gtin: string }>(
        `UPDATE sku_catalog
            SET gtin = COALESCE(NULLIF(gtin, ''), $1),
                updated_at = NOW()
          WHERE id = $2 AND organization_id = $3
          RETURNING gtin`,
        [candidate, skuCatalogId, orgId],
      );
      const updated = updatedRes.rows[0];
      if (!updated?.gtin) {
        throw new Error(`getOrCreateInternalGtin: UPDATE returned no row for id ${skuCatalogId}`);
      }
      return updated.gtin;
    });
  }

  // Fast path: read existing.
  const existing = await queryOne<{ gtin: string | null }>`
    SELECT gtin FROM sku_catalog WHERE id = ${skuCatalogId} LIMIT 1
  `;
  if (!existing) {
    throw new Error(`getOrCreateInternalGtin: sku_catalog id ${skuCatalogId} not found`);
  }
  if (existing.gtin && existing.gtin.trim()) return existing.gtin.trim();

  // Generate + persist. COALESCE so a concurrent writer's value wins
  // and we return the final stored value, not our newly-computed one.
  const candidate = generateInternalGtin(skuCatalogId);
  const updated = await queryOne<{ gtin: string }>`
    UPDATE sku_catalog
       SET gtin = COALESCE(NULLIF(gtin, ''), ${candidate}),
           updated_at = NOW()
     WHERE id = ${skuCatalogId}
     RETURNING gtin
  `;
  if (!updated?.gtin) {
    throw new Error(`getOrCreateInternalGtin: UPDATE returned no row for id ${skuCatalogId}`);
  }
  return updated.gtin;
}
