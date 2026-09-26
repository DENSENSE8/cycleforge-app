/** internal-gtin.ts ──────────────────────────────────────────────────────────────────── Internal pseudo-GTIN generator for USAV unit labels. */

import { queryOne } from '@/lib/neon-client';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** GS1-internal indicator + prefix. Real GS1 prefixes start at 03+, so
 *  values starting with `02` cannot collide with real public GTINs. */
const INTERNAL_GTIN_PREFIX = '02';

/**
 * GS1 mod-10 check-digit algorithm. The body is the 13-digit prefix
 * (everything before the check digit). Multipliers alternate 3,1 from
 * the rightmost body digit leftward.
 */
export function gs1CheckDigit(body13: string): string {
  if (body13.length !== 13 || !/^\d{13}$/.test(body13)) {
    throw new Error(`gs1CheckDigit: body must be exactly 13 digits, got "${body13}"`);
  }
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = Number(body13[12 - i]); // rightmost first
    const multiplier = i % 2 === 0 ? 3 : 1;
    sum += digit * multiplier;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Deterministic 14-digit GTIN for a given sku_catalog.id. Does not
 * touch the DB.
 */
export function generateInternalGtin(skuCatalogId: number): string {
  if (!Number.isInteger(skuCatalogId) || skuCatalogId < 0 || skuCatalogId > 9_999_999_999_99) {
    throw new Error(`generateInternalGtin: invalid sku_catalog id ${skuCatalogId}`);
  }
  const idPart = String(skuCatalogId).padStart(11, '0');
  const body = INTERNAL_GTIN_PREFIX + idPart;
  return body + gs1CheckDigit(body);
}

/** Sanity check for GTIN-14 strings. */
export function isValidGtin14(gtin: string): boolean {
  if (!/^\d{14}$/.test(gtin)) return false;
  return gs1CheckDigit(gtin.slice(0, 13)) === gtin[13];
}

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
